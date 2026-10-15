import type { LatestStep, StepProgress } from "@my-ba/db"
import {
  gateStatusSchema,
  type ScreeningStage,
  type ScreeningStageState,
  screeningGateSchema,
  screeningStageSchema,
  stageFailureReasonSchema,
  type TaskStatus,
} from "@my-ba/shared"

/**
 * How long a stage may wait on the worker (`queued` / `running`) without any
 * change before it reads as stalled and Retry is offered. A screen takes
 * seconds; this is generous so a slow-but-alive worker is not raced.
 */
export const SCREENING_STALL_AFTER_MS = 5 * 60_000

export interface ScreeningProgressInput {
  taskStatus: TaskStatus
  /** `purchase_tasks.updated_at`. Bumped by every run / retry / approve request. */
  taskUpdatedAt: Date
  /** The latest screening attempt, or null before the first. */
  step: StepProgress | null
  /** Postgres `now()`, the clock both timestamps above were stamped with. */
  now: Date
}

export interface ScreeningStageInput extends ScreeningProgressInput {
  step: LatestStep | null
  /** Every attempt's spend, summed. */
  totalCostAud: string
}

export interface ScreeningProgress {
  state: ScreeningStageState
  stalled: boolean
  /**
   * Opaque; changes whenever anything the detail page shows could have. Every
   * write the stage makes bumps the task's or the latest attempt's
   * `updated_at` (status changes, run / approve stamps, attempt and gate
   * writes), and `stalled` flips on time alone, so the three together cover it.
   */
  version: string
}

/**
 * Where the screening stage is, from Postgres alone (P1-6, D75).
 *
 * The API never reads the LangGraph checkpoint. The worker mirrors gates onto
 * the attempt's row, and the API stamps the task's `updated_at` when it asks
 * the worker for something (run, retry, approve). So "the task changed after
 * the latest attempt did" means a request is waiting for the worker: `queued`.
 * Both timestamps come from the same Postgres clock (`now()`).
 */
export function deriveScreeningStage(input: ScreeningStageInput): ScreeningStage | null {
  const { step } = input
  const progress = deriveScreeningProgress(input)
  if (progress === null) return null
  return screeningStageSchema.parse({
    ...progress,
    attempt: step?.attempt ?? null,
    gate: step?.gatePayload ? screeningGateSchema.parse(step.gatePayload) : null,
    gateStatus: gateStatusSchema.nullable().parse(step?.gateStatus ?? null),
    failureReason: stageFailureReasonSchema.nullable().parse(step?.failureReason ?? null),
    costAud: step?.costAud ?? "0.0000",
    totalCostAud: input.totalCostAud,
  })
}

/**
 * The stage's state, and whether it is stalled: waiting on the worker with
 * nothing changed on either row for `SCREENING_STALL_AFTER_MS`. Jobs run once
 * (`attempts: 1`), so a worker that dies between its writes, or a job lost
 * with the queue, would otherwise leave the task waiting forever. A stalled
 * stage accepts Retry, which asks the worker to reconcile the thread.
 */
export function deriveScreeningProgress(input: ScreeningProgressInput): ScreeningProgress | null {
  const state = deriveState(input)
  if (state === null) return null
  const lastChange = Math.max(input.taskUpdatedAt.getTime(), input.step?.updatedAt.getTime() ?? 0)
  const stalled =
    (state === "queued" || state === "running") &&
    input.now.getTime() - lastChange >= SCREENING_STALL_AFTER_MS
  return { state, stalled, version: stageVersion(input, stalled) }
}

/** See `ScreeningProgress.version`. Also defined for a draft with no stage, so the poll can report it. */
export function stageVersion(
  input: Pick<ScreeningProgressInput, "taskUpdatedAt" | "step">,
  stalled: boolean,
): string {
  return [
    input.taskUpdatedAt.getTime(),
    input.step?.updatedAt.getTime() ?? 0,
    stalled ? 1 : 0,
  ].join("-")
}

function deriveState({
  taskStatus,
  taskUpdatedAt,
  step,
}: ScreeningProgressInput): ScreeningStageState | null {
  if (taskStatus === "DRAFT") {
    // A draft that was never run has no stage. One that was sent back by
    // Reject & Adjust shows that; a failed attempt cannot leave a task in
    // DRAFT, but report it honestly if one ever does.
    if (step?.gateStatus === "rejected") return "rejected"
    if (step?.status === "failed") return "failed"
    return null
  }
  if (taskStatus !== "SCREENING") return "approved"

  if (!step) return "queued"
  const requestedSinceStep = taskUpdatedAt.getTime() > step.updatedAt.getTime()

  switch (step.status) {
    case "running":
      return "running"
    case "failed":
      return requestedSinceStep ? "queued" : "failed"
    default:
      break
  }
  switch (step.gateStatus) {
    case "awaiting":
      // An approval was requested and the worker has not finished it yet.
      return requestedSinceStep ? "queued" : "awaiting_approval"
    case "rejected":
      // Back in SCREENING after a rejection: the re-run is waiting.
      return "queued"
    case "approved":
      return "approved"
    default:
      // Completed, gate not mirrored yet: the worker is between the two writes
      // (or died there, which `stalled` catches).
      return "running"
  }
}
