import { factorIdSchema } from "@my-ba/domain"
import { z } from "zod"

import { auStateSchema } from "../domain/au-state"
import { tenantJobSchema } from "./queue"
import { criteriaSchema } from "./criteria"

/**
 * Screening stage contracts (P1-4, D73): the two HITL gate payloads the
 * screener interrupts with, and the `screening` job payload. Shared so the
 * API (P1-6 resume endpoint) and the web approval UI (P1-5) parse the same
 * shapes the orchestrator emits, without depending on the orchestrator.
 */

/** AUD inc GST as a decimal string with up to 4 dp, as stored in `numeric(10, 4)` (D62). */
export const audAmountSchema = z.string().regex(/^\d+(\.\d{1,4})?$/, "Expected an AUD amount")

const fraction = z.number().finite().nullable()

/** One suburb in the approval gate, ranked (P1-8 `Ranked`, projected for display). */
export const screenedSuburbSchema = z.strictObject({
  rank: z.int().positive(),
  /** HtAG `loc_pid`. */
  areaId: z.string().min(1),
  suburbId: z.uuid(),
  name: z.string().min(1),
  state: auStateSchema,
  postcode: z.string().min(1),
  /** 0–1. Null when coverage is 0. */
  score: z.number().min(0).max(1).nullable(),
  coverage: z.number().min(0).max(1.000000001),
  insufficientData: z.boolean(),
  /** Raw factor inputs, fractions (P1-8 `RawMetrics`). Null = not available. */
  raw: z.strictObject({
    yieldNow: fraction,
    rentGrowth12m: fraction,
    priceGrowth36m: fraction,
    renterProportion: fraction,
    priceVolatility: fraction,
  }),
  /** Latest-period supply detail; null outside the Restricted-tier top N (step 7). */
  supply: z
    .strictObject({
      periodEnd: z.iso.date().nullable(),
      somPercent: fraction,
      daysOnMarket: z.number().finite().nullable(),
      vacancyRate: fraction,
    })
    .nullable(),
})
export type ScreenedSuburb = z.infer<typeof screenedSuburbSchema>

const screeningGateBase = {
  stage: z.literal("screening"),
  /** The `analysis_steps` row of this attempt (full breakdown in `screening_results`). */
  analysisStepId: z.uuid(),
  /** 1-based; increments each time the graph loops back to screen. */
  attempt: z.int().positive(),
  /** The criteria this attempt ran with, after any dev state override (Q04). */
  criteria: criteriaSchema,
  /** Summed from `htag_calls` for the step (AC 4). */
  costAud: audAmountSchema,
}

/**
 * Step 2: the query came back full (`returned === limit`). No further HtAG
 * call was made (D42). The only way on is tighter criteria: resuming loops
 * back to screen with whatever criteria the task holds by then.
 */
export const screeningTooBroadGateSchema = z.strictObject({
  kind: z.literal("SCREENING_TOO_BROAD"),
  ...screeningGateBase,
  returned: z.int().nonnegative(),
  limit: z.int().positive(),
})
export type ScreeningTooBroadGate = z.infer<typeof screeningTooBroadGateSchema>

/** Step 9: the ranked survivor set, for approval. Empty is a valid result (AC 2). */
export const screeningApprovalGateSchema = z.strictObject({
  kind: z.literal("SCREENING_APPROVAL"),
  ...screeningGateBase,
  rankedSuburbs: z.array(screenedSuburbSchema),
  /** Factors switched off for the whole run (e.g. `low_volatility`, AC 6). */
  disabledFactors: z.array(factorIdSchema),
  /** Share of ranked suburbs with an ABS renter proportion (P1-10 AC 1). Null when none ranked. */
  renterCoverage: z.number().min(0).max(1).nullable(),
  /** Screened suburbs dropped because no postcode could be found (D73). */
  droppedAreaIds: z.array(z.string()),
})
export type ScreeningApprovalGate = z.infer<typeof screeningApprovalGateSchema>

/** Either screening gate, discriminated on `kind`. */
export const screeningGateSchema = z.discriminatedUnion("kind", [
  screeningTooBroadGateSchema,
  screeningApprovalGateSchema,
])
export type ScreeningGate = z.infer<typeof screeningGateSchema>

/** `analysis_steps.gate_kind` values (P1-6, D75). One per gate payload `kind`. */
export const GATE_KINDS = ["SCREENING_TOO_BROAD", "SCREENING_APPROVAL"] as const
export const gateKindSchema = z.enum(GATE_KINDS)

/**
 * `analysis_steps.gate_status` (D75):
 * - `awaiting`: the thread is paused at the gate.
 * - `approved`: the user approved and the stage completed.
 * - `rejected`: Reject & Adjust. The thread stays paused at this gate until
 *   the next Run resumes it with `approved: false`.
 */
export const GATE_STATUSES = ["awaiting", "approved", "rejected"] as const
export const gateStatusSchema = z.enum(GATE_STATUSES)
export type GateStatus = z.infer<typeof gateStatusSchema>

/**
 * Typed reasons a stage attempt failed (P1-4 AC 5), as stored in
 * `analysis_steps.failure_reason`. All are retryable from the checkpoint.
 */
export const STAGE_FAILURE_REASONS = [
  "HTAG_QUOTA_EXCEEDED",
  "HTAG_BALANCE_EXHAUSTED",
  "INVALID_CRITERIA",
  /** Anything else (HtAG 5xx after retries, network, a bug). */
  "UNEXPECTED",
] as const
export const stageFailureReasonSchema = z.enum(STAGE_FAILURE_REASONS)
export type StageFailureReason = z.infer<typeof stageFailureReasonSchema>

const gateNote = z.string().trim().max(2_000)

/**
 * `POST /api/purchase-tasks/:taskId/approve` (P1-6). `keep` is the subset of
 * the gate's ranked area ids the user kept; omitted = keep all. Checked
 * against the stored gate before anything is enqueued.
 */
export const approveScreeningRequestSchema = z.strictObject({
  keep: z.array(z.string().min(1)).max(1_000).optional(),
  note: gateNote.optional(),
})
export type ApproveScreeningRequest = z.infer<typeof approveScreeningRequestSchema>

/** `POST /api/purchase-tasks/:taskId/reject` (Reject & Adjust, P1-6). */
export const rejectScreeningRequestSchema = z.strictObject({
  note: gateNote.optional(),
})
export type RejectScreeningRequest = z.infer<typeof rejectScreeningRequestSchema>

/**
 * Where the screening stage is, for the task detail page (P1-6):
 * - `queued`: a run, retry or approval was requested and the worker has not
 *   picked it up yet.
 * - `running`: the worker is screening (an attempt row is `running`).
 * - `awaiting_approval`: paused at a gate; `gate` says which.
 * - `failed`: the latest attempt failed with `failureReason`; Retry re-runs it.
 * - `rejected`: Reject & Adjust; the task is back in `DRAFT`.
 * - `approved`: the stage completed and the task moved on.
 *
 * `stalled` qualifies `queued` and `running`: nothing has changed for long
 * enough that the worker has likely lost the job (a crash between its writes,
 * a lost queue). Retry is offered, as after a failure.
 */
export const SCREENING_STAGE_STATES = [
  "queued",
  "running",
  "awaiting_approval",
  "failed",
  "rejected",
  "approved",
] as const
export const screeningStageStateSchema = z.enum(SCREENING_STAGE_STATES)
export type ScreeningStageState = z.infer<typeof screeningStageStateSchema>

export const screeningStageSchema = z.strictObject({
  state: screeningStageStateSchema,
  /** Waiting on the worker (`queued` / `running`) with no progress for too long. */
  stalled: z.boolean(),
  /** Changes whenever anything the page shows could have changed; see `screeningStageStatusSchema`. */
  version: z.string().min(1),
  /** The latest attempt; null when queued before the first one starts. */
  attempt: z.int().positive().nullable(),
  /** The gate of the latest attempt, when it paused at one (any `gateStatus`). */
  gate: screeningGateSchema.nullable(),
  gateStatus: gateStatusSchema.nullable(),
  failureReason: stageFailureReasonSchema.nullable(),
  /** The latest attempt's spend. */
  costAud: audAmountSchema,
  /** Every attempt's spend, summed (each loop pays again). */
  totalCostAud: audAmountSchema,
})
export type ScreeningStage = z.infer<typeof screeningStageSchema>

/**
 * `GET /api/purchase-tasks/:taskId/stage` (P1-6): the cheap poll behind the
 * detail page. The browser compares `version` with the one it rendered and
 * re-renders the page only when it differs; the API answers `304` to a
 * matching `If-None-Match`. `state` is null for a draft that never ran.
 */
export const screeningStageStatusSchema = z.strictObject({
  state: screeningStageStateSchema.nullable(),
  stalled: z.boolean(),
  version: screeningStageSchema.shape.version,
})
export type ScreeningStageStatus = z.infer<typeof screeningStageStatusSchema>

const screeningJobBase = tenantJobSchema.extend({ taskId: z.uuid() })

/**
 * Payload of a job on `QUEUE_NAMES.SCREENING` (P1-6, D75):
 * - `run`: start the stage, retry a failed attempt, or, when the thread is
 *   paused at a gate the user rejected, resume it with `approved: false` so
 *   the edited criteria are screened.
 * - `approve`: resume the approval gate with `approved: true`.
 */
export const screeningJobSchema = z.discriminatedUnion("action", [
  screeningJobBase.extend({ action: z.literal("run") }),
  screeningJobBase.extend({
    action: z.literal("approve"),
    keep: approveScreeningRequestSchema.shape.keep,
    note: approveScreeningRequestSchema.shape.note,
  }),
])
export type ScreeningJob = z.infer<typeof screeningJobSchema>
