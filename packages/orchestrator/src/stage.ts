import { z } from "zod"

/**
 * The orchestrator contract. Everything outside this package talks to
 * `Orchestrator`, never to LangGraph types, so D22's fallback (a hand-rolled
 * state machine with Redis-backed pause state) can replace the implementation
 * without touching callers.
 *
 * Delta from docs/02's `runStage(taskId, stage)`: the ref also carries
 * `tenantId`. Checkpoint tables sit outside RLS (D51), so the tenant is baked
 * into the thread id instead, and the caller has to supply it.
 */

/** P1 stages get added here. `spike` exists only for P0-5. */
export const StageName = z.enum(["spike"])
export type StageName = z.infer<typeof StageName>

export const StageRef = z.object({
  tenantId: z.uuid(),
  taskId: z.uuid(),
  stage: StageName,
})
export type StageRef = z.infer<typeof StageRef>

/** What a HITL gate shows the user. Emitted through `interrupt()`. */
export const GatePayload = z.object({
  kind: z.literal("approval"),
  stage: StageName,
  summary: z.string().min(1),
  items: z.array(z.string()),
})
export type GatePayload = z.infer<typeof GatePayload>

/** What the approval endpoint sends back. Validated before the graph sees it. */
export const GateDecision = z.discriminatedUnion("approved", [
  z.object({
    approved: z.literal(true),
    /** Subset of the gate's items the user kept. Omitted = keep all. */
    keep: z.array(z.string()).optional(),
    note: z.string().max(2_000).optional(),
  }),
  z.object({
    approved: z.literal(false),
    note: z.string().max(2_000).optional(),
  }),
])
export type GateDecision = z.infer<typeof GateDecision>

export const StageOutput = z.object({
  approved: z.boolean(),
  items: z.array(z.string()),
})
export type StageOutput = z.infer<typeof StageOutput>

export const StageResult = z.discriminatedUnion("status", [
  z.object({ status: z.literal("not_started") }),
  /** Paused at a HITL gate. Durable: survives process death. */
  z.object({ status: z.literal("awaiting_approval"), gate: GatePayload }),
  /**
   * A checkpoint exists with work still to do and no pending interrupt — the
   * process died mid-node. `runStage` picks it up from the last checkpoint.
   */
  z.object({ status: z.literal("incomplete"), next: z.array(z.string()) }),
  z.object({ status: z.literal("completed"), output: StageOutput }),
  z.object({ status: z.literal("failed"), error: z.string() }),
])
export type StageResult = z.infer<typeof StageResult>

export interface Orchestrator {
  /** Start the stage, or continue an `incomplete` one. Idempotent otherwise. */
  runStage(ref: StageRef): Promise<StageResult>
  /** Resume a stage that is `awaiting_approval`. Throws for any other state. */
  resumeStage(ref: StageRef, decision: GateDecision): Promise<StageResult>
  /** Read-only. Derived from the latest checkpoint. */
  getStageResult(ref: StageRef): Promise<StageResult>
  close(): Promise<void>
}

/**
 * One LangGraph thread per (tenant, task, stage). Tenant first, so a
 * tenant's checkpoints can be found and purged with a prefix match even
 * though the checkpoint tables carry no tenant_id column (D51).
 */
export function threadIdFor(ref: StageRef): string {
  const parsed = StageRef.parse(ref)
  return `tenant:${parsed.tenantId}:task:${parsed.taskId}:stage:${parsed.stage}`
}
