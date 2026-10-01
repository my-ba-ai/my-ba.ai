import { z } from "zod"

/**
 * HtAG vocabulary shared by the schema (`@my-ba/db` CHECK constraints) and the
 * REST client (P1-1). Stored as text + CHECK rather than a Postgres enum: these
 * are HtAG's values, not ours, and widening a CHECK is a generated migration
 * where widening an enum is a hand-written `ALTER TYPE`.
 */

/** HtAG `property_type`. A billable row is area × property_type × period (Q13a). */
export const HTAG_PROPERTY_TYPES = ["house", "unit"] as const
export const htagPropertyTypeSchema = z.enum(HTAG_PROPERTY_TYPES)
export type HtagPropertyType = z.infer<typeof htagPropertyTypeSchema>

/** D40: `bedrooms` is stored as HtAG's aggregate value for MVP. */
export const HTAG_BEDROOMS_ALL = "All"

/**
 * HtAG billing tiers (Q13d). Per-row AUD rates live in config, not here —
 * they are prices, and prices change. `agent` exists so a call can be
 * recorded if one is ever made, though D41 rules them out of the pipeline.
 */
export const HTAG_TIERS = [
  "reference",
  "standard",
  "enhanced",
  "premium",
  "restricted",
  "agent",
] as const
export const htagTierSchema = z.enum(HTAG_TIERS)
export type HtagTier = z.infer<typeof htagTierSchema>

/**
 * `X-Billing-Tier` response header: the volume band the request's last billable
 * unit landed in. Not the same thing as `HtagTier` — that is the endpoint's value
 * tier (Reference, Premium, …), which comes from the spec, not a header (D62).
 */
export const HTAG_BILLING_TIERS = ["free", "tier1", "tier2", "tier3"] as const
export const htagBillingTierSchema = z.enum(HTAG_BILLING_TIERS)
export type HtagBillingTier = z.infer<typeof htagBillingTierSchema>

/**
 * Where `htag_calls.cost_aud` came from (D62): HtAG's `X-Billing-Cost` header,
 * rows × the configured rate when a 2xx arrived without billing headers, or
 * nothing charged (non-2xx, network error).
 */
export const HTAG_COST_SOURCES = ["header", "config_estimate", "none"] as const
export const htagCostSourceSchema = z.enum(HTAG_COST_SOURCES)
export type HtagCostSource = z.infer<typeof htagCostSourceSchema>
