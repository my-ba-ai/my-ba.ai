import {
  type GateStatus,
  type ScreeningGate,
  type ScreeningJob,
  screeningGateSchema,
} from "@my-ba/shared"
import { InvalidGateDecisionError, StageNotAwaitingApprovalError } from "../langgraph-orchestrator"
import type { GateDecision, Orchestrator, StageRef, StageResult } from "../stage"
import type { StageSync } from "./stage-sync"

/**
 * A screening job that cannot succeed by being retried: the payload asks for
 * something the stage's state doesn't allow. The worker maps it to BullMQ's
 * `UnrecoverableError`.
 */
export class ScreeningJobRejectedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ScreeningJobRejectedError"
  }
}

export interface ScreeningJobLogger {
  warn(message: string): void
}

export interface ScreeningJobDeps {
  orchestrator: Orchestrator
  sync: StageSync
  logger?: ScreeningJobLogger
}

type ApproveJob = Extract<ScreeningJob, { action: "approve" }>

/**
 * What a `screening` job does (P1-4, P1-6, D75). Decides which orchestrator
 * call to make, then syncs the result to Postgres (`StageSync`) so the API can
 * show it without reading the checkpoint:
 *
 * - `run`: a thread paused at a gate the user rejected is resumed with
 *   `approved: false` (the re-screen of the edited criteria). A thread still
 *   awaiting the user is left alone (its gate re-mirrored). A completed
 *   thread had its approval sync lost; that sync is finished. Anything else
 *   goes to `runStage` (start, continue after a crash, or retry a failed
 *   attempt).
 * - `approve`: resume the approval gate with `approved: true`; once the stage
 *   completes, record the approval and move the task to `TREND_ANALYSIS`.
 *
 * Sync happens here, after the orchestrator returns, never inside a graph
 * node: LangGraph re-runs an interrupting node from the top on resume (D74).
 * A `failed` result is returned, not thrown; the caller decides retries.
 */
export async function handleScreeningJob(
  deps: ScreeningJobDeps,
  job: ScreeningJob,
): Promise<StageResult> {
  const ref: StageRef = { tenantId: job.tenantId, taskId: job.taskId, stage: "screening" }
  return job.action === "approve" ? approve(deps, ref, job) : run(deps, ref)
}

async function run(deps: ScreeningJobDeps, ref: StageRef): Promise<StageResult> {
  const current = await deps.orchestrator.getStageResult(ref)
  if (current.status === "completed") {
    // Only reachable as Retry on a stalled stage: the approval resume finished
    // but its sync never landed, so the task is still SCREENING. The kept
    // suburbs are what the graph finalised; who approved was not recorded.
    const stepId = await deps.sync.latestStepId(ref.tenantId, ref.taskId)
    if (!stepId) {
      deps.logger?.warn(`task ${ref.taskId}: stage completed but no attempt row to record it on`)
      return current
    }
    deps.logger?.warn(`task ${ref.taskId}: stage completed without its approval sync; recording it`)
    const decision: GateDecision = { approved: true, keep: [...current.output.items] }
    await recordApproval(deps, ref, stepId, decision, null)
    return current
  }
  if (current.status !== "awaiting_approval") {
    return syncResult(deps, ref, await deps.orchestrator.runStage(ref))
  }

  const gate = screeningGate(current)
  const answer: GateStatus | null = await deps.sync.gateStatus(ref.tenantId, gate.analysisStepId)
  if (answer !== "rejected") {
    // Still waiting on the user (a stray or repeated run job). Nothing to
    // run; re-mirroring is idempotent and repairs a lost earlier sync.
    deps.logger?.warn(`task ${ref.taskId}: run requested while awaiting approval; no-op`)
    return syncResult(deps, ref, current)
  }
  // Reject & Adjust happened in the API; this is the re-run it deferred. The
  // graph loops back to screen, which re-reads the edited criteria.
  return syncResult(deps, ref, await resume(deps, ref, { approved: false }))
}

async function approve(
  deps: ScreeningJobDeps,
  ref: StageRef,
  job: ApproveJob,
): Promise<StageResult> {
  const decision: GateDecision = {
    approved: true,
    ...(job.keep ? { keep: job.keep } : {}),
    ...(job.note ? { note: job.note } : {}),
  }
  const current = await deps.orchestrator.getStageResult(ref)

  if (current.status === "completed") {
    // Redelivered after the resume finished but before the sync did.
    const stepId = await deps.sync.latestStepId(ref.tenantId, ref.taskId)
    if (stepId) await recordApproval(deps, ref, stepId, decision, job.requestedBy)
    return current
  }
  if (current.status !== "awaiting_approval") {
    throw new ScreeningJobRejectedError(
      `task ${ref.taskId} is ${current.status}, not awaiting approval`,
    )
  }
  const gate = screeningGate(current)
  if (gate.kind !== "SCREENING_APPROVAL") {
    throw new ScreeningJobRejectedError(
      `task ${ref.taskId} is at ${gate.kind}, which has no approve`,
    )
  }

  const result = await resume(deps, ref, decision)
  if (result.status === "completed") {
    await recordApproval(deps, ref, gate.analysisStepId, decision, job.requestedBy)
    return result
  }
  return syncResult(deps, ref, result)
}

async function recordApproval(
  deps: ScreeningJobDeps,
  ref: StageRef,
  analysisStepId: string,
  decision: GateDecision,
  decidedBy: string | null,
): Promise<void> {
  const synced = await deps.sync.approved({
    tenantId: ref.tenantId,
    taskId: ref.taskId,
    analysisStepId,
    decision: { ...decision },
    decidedBy,
  })
  if (!synced.gateRecorded || !synced.statusChanged) {
    deps.logger?.warn(
      `task ${ref.taskId}: approval sync was already done ${JSON.stringify(synced)}`,
    )
  }
}

/** Resume, turning a decision the gate cannot take into a rejected job. */
async function resume(
  deps: ScreeningJobDeps,
  ref: StageRef,
  decision: GateDecision,
): Promise<StageResult> {
  try {
    return await deps.orchestrator.resumeStage(ref, decision)
  } catch (error) {
    if (
      error instanceof InvalidGateDecisionError ||
      error instanceof StageNotAwaitingApprovalError
    ) {
      throw new ScreeningJobRejectedError(error.message)
    }
    throw error
  }
}

/** Mirror a gate the graph is paused at; other results need no write here. */
async function syncResult(
  deps: ScreeningJobDeps,
  ref: StageRef,
  result: StageResult,
): Promise<StageResult> {
  if (result.status === "awaiting_approval") {
    const mirrored = await deps.sync.awaiting(ref.tenantId, screeningGate(result))
    if (!mirrored) {
      deps.logger?.warn(`task ${ref.taskId}: gate not mirrored (step not completed or answered)`)
    }
  }
  return result
}

/** The screening stage only interrupts with the two screening gates. */
function screeningGate(
  result: Extract<StageResult, { status: "awaiting_approval" }>,
): ScreeningGate {
  const gate = screeningGateSchema.safeParse(result.gate)
  if (!gate.success) {
    throw new ScreeningJobRejectedError(
      `unexpected gate ${result.gate.kind} on the screening stage`,
    )
  }
  return gate.data
}
