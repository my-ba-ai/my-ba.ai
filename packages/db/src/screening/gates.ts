import {
  type GateStatus,
  gateStatusSchema,
  isLegalStatusChange,
  type ScreeningGate,
  type TaskStatus,
} from "@my-ba/shared"
import { and, desc, eq, sql } from "drizzle-orm"
import type { Database } from "../client"
import { analysisSteps, purchaseTasks, type AnalysisStage } from "../schema"
import { type TenantTransaction, withTenant } from "../tenant"

/**
 * Stage ↔ task status sync (P1-6, D75). The orchestrator's checkpoint is the
 * source of truth for where a graph is; these helpers mirror what the API
 * needs to show and act on into Postgres, so the API never builds a graph.
 *
 * Everything here is transaction-level (`TenantTransaction`) so a status
 * change and the step write it belongs to commit together. The `db`-level
 * wrappers at the bottom open the tenant transaction for the worker.
 */

/** The columns of the latest attempt the API and worker read. */
const latestStepColumns = {
  id: analysisSteps.id,
  attempt: analysisSteps.attempt,
  status: analysisSteps.status,
  failureReason: analysisSteps.failureReason,
  costAud: analysisSteps.costAud,
  gateKind: analysisSteps.gateKind,
  gateStatus: analysisSteps.gateStatus,
  gatePayload: analysisSteps.gatePayload,
  updatedAt: analysisSteps.updatedAt,
}

/** What it takes to tell where a stage is, without the attempt's payloads. */
export interface StepProgress {
  attempt: number
  status: string
  gateStatus: string | null
  updatedAt: Date
}

export interface LatestStep extends StepProgress {
  id: string
  failureReason: string | null
  costAud: string
  gateKind: string | null
  gatePayload: Record<string, unknown> | null
}

/** The task's latest attempt for `stage`, or null before the first one. */
export async function readLatestStep(
  tx: TenantTransaction,
  taskId: string,
  stage: AnalysisStage,
): Promise<LatestStep | null> {
  const [row] = await tx
    .select(latestStepColumns)
    .from(analysisSteps)
    .where(and(eq(analysisSteps.taskId, taskId), eq(analysisSteps.stage, stage)))
    .orderBy(desc(analysisSteps.attempt))
    .limit(1)
  return row ?? null
}

export interface StageProgressRead {
  task: { status: string; updatedAt: Date; dbNow: Date }
  step: StepProgress | null
}

/**
 * The cheap read behind the stage poll (P1-6): the task's status and stamps
 * plus the latest attempt's progress columns. No lock and no jsonb (a gate
 * payload carries every ranked suburb). Null when the task is not visible.
 */
export async function readStageProgress(
  tx: TenantTransaction,
  taskId: string,
  stage: AnalysisStage,
): Promise<StageProgressRead | null> {
  const [task] = await tx
    .select({ status: purchaseTasks.status, updatedAt: purchaseTasks.updatedAt, dbNow: dbNow() })
    .from(purchaseTasks)
    .where(eq(purchaseTasks.id, taskId))
    .limit(1)
  if (!task) return null
  const [step] = await tx
    .select({
      attempt: analysisSteps.attempt,
      status: analysisSteps.status,
      gateStatus: analysisSteps.gateStatus,
      updatedAt: analysisSteps.updatedAt,
    })
    .from(analysisSteps)
    .where(and(eq(analysisSteps.taskId, taskId), eq(analysisSteps.stage, stage)))
    .orderBy(desc(analysisSteps.attempt))
    .limit(1)
  return { task, step: step ?? null }
}

export interface LockedTask {
  status: string
  lockedAt: Date | null
  criteria: unknown
  updatedAt: Date
  /** Postgres `now()` (transaction start): the clock `updatedAt` was stamped with. */
  dbNow: Date
}

/**
 * Postgres `now()` as a select column, mapped to a `Date`. Compare it with an
 * `updated_at` rather than the app's clock: both then come from Postgres.
 */
export function dbNow() {
  return sql<Date>`now()`.mapWith(purchaseTasks.updatedAt)
}

/**
 * Reads the task `FOR UPDATE`, so a run / approve / reject request holds it
 * until its transaction commits and a concurrent one waits, then sees the
 * new state. Null when the task is not visible to the tenant.
 */
export async function lockTask(tx: TenantTransaction, taskId: string): Promise<LockedTask | null> {
  const [task] = await tx
    .select({
      status: purchaseTasks.status,
      lockedAt: purchaseTasks.lockedAt,
      criteria: purchaseTasks.criteria,
      updatedAt: purchaseTasks.updatedAt,
      dbNow: dbNow(),
    })
    .from(purchaseTasks)
    .where(eq(purchaseTasks.id, taskId))
    .for("update")
    .limit(1)
  return task ?? null
}

/**
 * Bumps the latest attempt's `updated_at`, making it newer than the task
 * again. Undoes a request marker (`touchTask`) when the enqueue that should
 * have followed it failed.
 */
export async function touchLatestStep(
  tx: TenantTransaction,
  taskId: string,
  stage: AnalysisStage,
): Promise<void> {
  const step = await readLatestStep(tx, taskId, stage)
  if (!step) return
  await tx
    .update(analysisSteps)
    .set({ updatedAt: sql`now()` })
    .where(eq(analysisSteps.id, step.id))
}

/** Every attempt's spend for the stage, summed. Decimal string, 4 dp. */
export async function sumStageCost(
  tx: TenantTransaction,
  taskId: string,
  stage: AnalysisStage,
): Promise<string> {
  const [row] = await tx
    .select({
      total: sql<string>`coalesce(sum(${analysisSteps.costAud}), 0)::numeric(10, 4)::text`,
    })
    .from(analysisSteps)
    .where(and(eq(analysisSteps.taskId, taskId), eq(analysisSteps.stage, stage)))
  return row?.total ?? "0.0000"
}

export class IllegalStatusChangeError extends Error {
  constructor(
    readonly from: TaskStatus,
    readonly to: TaskStatus,
  ) {
    super(`task status cannot change from ${from} to ${to}`)
    this.name = "IllegalStatusChangeError"
  }
}

/**
 * Conditional status change: only moves the task if it is still `from`, and
 * only along a legal edge (`isLegalStatusChange`, D75). Returns false when the
 * task is missing or no longer `from` (a lost race), so the caller decides
 * between 404 and 409. Always bumps `updated_at`: the API reads it to tell a
 * requested-but-not-started run from the attempt before it (see the API's
 * screening state derivation).
 */
export async function changeTaskStatus(
  tx: TenantTransaction,
  taskId: string,
  from: TaskStatus,
  to: TaskStatus,
): Promise<boolean> {
  if (!isLegalStatusChange(from, to)) throw new IllegalStatusChangeError(from, to)
  const rows = await tx
    .update(purchaseTasks)
    .set({ status: to, updatedAt: sql`now()` })
    .where(and(eq(purchaseTasks.id, taskId), eq(purchaseTasks.status, from)))
    .returning({ id: purchaseTasks.id })
  return rows.length === 1
}

/** Bumps `updated_at` without a status change (an approval was requested). */
export async function touchTask(tx: TenantTransaction, taskId: string): Promise<void> {
  await tx
    .update(purchaseTasks)
    .set({ updatedAt: sql`now()` })
    .where(eq(purchaseTasks.id, taskId))
}

/**
 * Records the gate an attempt paused at as `awaiting`. Idempotent: a repeat
 * (the worker re-reading a thread that is still paused) rewrites the same
 * payload. A gate the user already answered is left alone. Returns false when
 * nothing matched (the step is not completed, or the gate was answered).
 */
export async function mirrorAwaitingGate(
  tx: TenantTransaction,
  gate: ScreeningGate,
): Promise<boolean> {
  const rows = await tx
    .update(analysisSteps)
    .set({
      gateKind: gate.kind,
      gateStatus: "awaiting" satisfies GateStatus,
      gatePayload: { ...gate },
      updatedAt: sql`now()`,
    })
    .where(
      and(
        eq(analysisSteps.id, gate.analysisStepId),
        eq(analysisSteps.status, "completed"),
        sql`(${analysisSteps.gateStatus} is null or ${analysisSteps.gateStatus} = 'awaiting')`,
      ),
    )
    .returning({ id: analysisSteps.id })
  return rows.length === 1
}

/**
 * Answers an `awaiting` gate. Returns false when the gate is no longer
 * awaiting (already answered, or a different attempt), so a double submit is
 * a conflict rather than a second decision.
 */
export async function decideGate(
  tx: TenantTransaction,
  input: {
    analysisStepId: string
    status: Exclude<GateStatus, "awaiting">
    decision: Record<string, unknown>
    decidedBy: string | null
  },
): Promise<boolean> {
  const rows = await tx
    .update(analysisSteps)
    .set({
      gateStatus: input.status,
      gateDecision: input.decision,
      gateDecidedAt: sql`now()`,
      gateDecidedBy: input.decidedBy,
      updatedAt: sql`now()`,
    })
    .where(
      and(eq(analysisSteps.id, input.analysisStepId), eq(analysisSteps.gateStatus, "awaiting")),
    )
    .returning({ id: analysisSteps.id })
  return rows.length === 1
}

/** Worker: mirror a gate the graph paused at. The task stays `SCREENING`. */
export async function syncAwaitingGate(
  db: Database,
  tenantId: string,
  gate: ScreeningGate,
): Promise<boolean> {
  return withTenant(db, tenantId, (tx) => mirrorAwaitingGate(tx, gate))
}

/**
 * Worker: the approval resume completed. Records the approval on the
 * attempt's gate and moves the task `SCREENING → TREND_ANALYSIS`, together.
 * Returns what changed, so a re-delivered job (both already done) is a no-op
 * the caller can log rather than an error.
 */
export async function syncStageApproved(
  db: Database,
  input: {
    tenantId: string
    taskId: string
    analysisStepId: string
    decision: Record<string, unknown>
    decidedBy: string | null
  },
): Promise<{ gateRecorded: boolean; statusChanged: boolean }> {
  return withTenant(db, input.tenantId, async (tx) => {
    const gateRecorded = await decideGate(tx, {
      analysisStepId: input.analysisStepId,
      status: "approved",
      decision: input.decision,
      decidedBy: input.decidedBy,
    })
    const statusChanged = await changeTaskStatus(tx, input.taskId, "SCREENING", "TREND_ANALYSIS")
    return { gateRecorded, statusChanged }
  })
}

/** Worker: the latest gate status of the attempt that owns a gate (to tell a rejected gate from one still awaiting). */
export async function readGateStatus(
  db: Database,
  tenantId: string,
  analysisStepId: string,
): Promise<GateStatus | null> {
  const [row] = await withTenant(db, tenantId, (tx) =>
    tx
      .select({ gateStatus: analysisSteps.gateStatus })
      .from(analysisSteps)
      .where(eq(analysisSteps.id, analysisStepId)),
  )
  return gateStatusSchema.nullable().parse(row?.gateStatus ?? null)
}
