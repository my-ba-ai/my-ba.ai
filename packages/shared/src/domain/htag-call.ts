import { z } from "zod"
import { htagBillingTierSchema, htagCostSourceSchema, htagTierSchema } from "./htag"

/** AUD amount as HtAG sends it: a non-negative decimal string, e.g. `"0.666"`. */
export const audDecimalSchema = z.string().regex(/^\d+(?:\.\d+)?$/, "AUD decimal string")

/**
 * One HtAG HTTP attempt, as the client reports it (D63). Every page and every
 * retry is its own record, including non-2xx responses and network errors.
 *
 * Tenant, task and analysis step are deliberately absent: the recorder is built
 * with that scope bound, so a single call cannot be recorded against the wrong
 * tenant by forgetting a field.
 */
export const htagCallRecordSchema = z.object({
  /** Path as called, e.g. `/markets/query`, `/markets/trends/price`. */
  endpoint: z.string().min(1),
  /** Query params or body as sent. Never contains the API key. */
  request: z.record(z.string(), z.unknown()),
  /** The endpoint's value tier, from the spec's `x-htg-pricingTier`. */
  tier: htagTierSchema,
  /** Null when no HTTP response arrived. */
  statusCode: z.int().min(100).max(599).nullable(),
  rowsReturned: z.int().nonnegative(),
  costAud: audDecimalSchema,
  costSource: htagCostSourceSchema,
  billedUnits: z.int().nonnegative().nullable(),
  billingBalanceAud: audDecimalSchema.nullable(),
  billingTier: htagBillingTierSchema.nullable(),
})

export type HtagCallRecord = z.infer<typeof htagCallRecordSchema>

/**
 * The HtAG spend ledger as the client sees it (D63). The client depends only
 * on this interface and stays free of a database dependency; `@my-ba/db`
 * provides the Postgres implementation.
 *
 * Implementations must not share the caller's transaction: a spend record has
 * to survive the caller rolling back. The client catches and logs anything
 * `record` throws and still returns the data it paid for.
 */
export interface HtagCallRecorder {
  record(call: HtagCallRecord): Promise<void>
}
