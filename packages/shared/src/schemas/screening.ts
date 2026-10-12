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

/** Payload of a job on `QUEUE_NAMES.SCREENING`. */
export const screeningJobSchema = tenantJobSchema.extend({
  taskId: z.uuid(),
})
export type ScreeningJob = z.infer<typeof screeningJobSchema>

/** `POST /api/dev/screening/:taskId` response (dev-only trigger, D73). */
export const enqueueScreeningJobResponseSchema = z.object({
  jobId: z.string().min(1),
  queue: z.string().min(1),
  taskId: z.uuid(),
})
export type EnqueueScreeningJobResponse = z.infer<typeof enqueueScreeningJobResponseSchema>
