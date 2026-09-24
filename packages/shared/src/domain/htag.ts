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
