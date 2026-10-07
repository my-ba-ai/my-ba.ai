import { z } from "zod"

import { criteriaSchema, draftCriteriaSchema } from "./criteria"

const taskName = z.string().trim().min(1, "Name the task").max(120)

/**
 * `intent` says what the caller is asking for (P1-3 AC 6):
 * - `draft` — save whatever is there; `criteria` parses as `draftCriteriaSchema`.
 * - `run` — `criteria` must parse as the full `criteriaSchema`. The task is
 *   saved but stays `DRAFT`: the transition to `SCREENING` and the enqueue
 *   arrive with P1-6, and the web button is disabled until then.
 */
export const saveIntentSchema = z.enum(["draft", "run"])
export type SaveIntent = z.infer<typeof saveIntentSchema>

const saveBody = <T extends z.ZodType>(criteria: T) => z.strictObject({ name: taskName, criteria })

/** `POST /api/purchase-tasks` and `PATCH /api/purchase-tasks/:taskId`. */
export const savePurchaseTaskRequestSchema = z.discriminatedUnion("intent", [
  saveBody(draftCriteriaSchema).extend({ intent: z.literal("draft") }),
  saveBody(criteriaSchema).extend({ intent: z.literal("run") }),
])
export type SavePurchaseTaskRequest = z.infer<typeof savePurchaseTaskRequestSchema>
export type SavePurchaseTaskRequestInput = z.input<typeof savePurchaseTaskRequestSchema>

/** One line of the screening cost ceiling (review step, P1-3). */
export const screeningCostLineSchema = z.strictObject({
  label: z.string().min(1),
  tier: z.string().min(1),
  rows: z.int().nonnegative(),
  rateAud: z.number().nonnegative(),
  costAud: z.number().nonnegative(),
})

/**
 * `GET /api/purchase-tasks/screening-estimate`. Worst case for one screening
 * run: a full query page, full trend history for every survivor (no cache
 * hits, no free allowance), restricted hydration for the top N.
 */
export const screeningCostEstimateSchema = z.strictObject({
  ceilingAud: z.number().nonnegative(),
  budgetAud: z.number().positive(),
  lines: z.array(screeningCostLineSchema).min(1),
})
export type ScreeningCostEstimate = z.infer<typeof screeningCostEstimateSchema>
