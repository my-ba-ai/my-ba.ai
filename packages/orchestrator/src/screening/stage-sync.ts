import {
  type Database,
  readGateStatus,
  readLatestStep,
  syncAwaitingGate,
  syncStageApproved,
  withTenant,
} from "@my-ba/db"
import type { GateStatus, ScreeningGate } from "@my-ba/shared"

/**
 * What a screening job writes to Postgres after the orchestrator returns
 * (P1-6, D75). An interface so the job handler.s tests use a fake; the graph's
 * gate nodes stay free of side effects (D74).
 */
export interface StageSync {
  /** The answer recorded on a gate's attempt row (null = not mirrored yet). */
  gateStatus(tenantId: string, analysisStepId: string): Promise<GateStatus | null>
  /** The latest screening attempt's id, or null before the first. */
  latestStepId(tenantId: string, taskId: string): Promise<string | null>
  /** Mirror a gate the graph paused at. The task stays `SCREENING`. */
  awaiting(tenantId: string, gate: ScreeningGate): Promise<boolean>
  /** Record the approval and move the task `SCREENING → TREND_ANALYSIS`. */
  approved(input: {
    tenantId: string
    taskId: string
    analysisStepId: string
    decision: Record<string, unknown>
    decidedBy: string | null
  }): Promise<{ gateRecorded: boolean; statusChanged: boolean }>
}

export function createPostgresStageSync(db: Database): StageSync {
  return {
    gateStatus: (tenantId, analysisStepId) => readGateStatus(db, tenantId, analysisStepId),
    latestStepId: async (tenantId, taskId) => {
      const step = await withTenant(db, tenantId, (tx) => readLatestStep(tx, taskId, "screening"))
      return step?.id ?? null
    },
    awaiting: (tenantId, gate) => syncAwaitingGate(db, tenantId, gate),
    approved: (input) => syncStageApproved(db, input),
  }
}
