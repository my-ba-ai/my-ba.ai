import { riskToleranceSchema, strategySchema, weightsSchema } from "@my-ba/domain"
import { z } from "zod"

import { auStateSchema } from "../domain/au-state"
import { HTAG_BEDROOMS_ALL, htagPropertyTypeSchema } from "../domain/htag"

/**
 * Purchase-task criteria (P1-3, D66): fixed structured fields, stored in
 * `purchase_tasks.criteria` and compiled to HtAG `logic` by
 * `compileToHtagLogic` (`@my-ba/htag-client`).
 *
 * Units are what the investor types: percentages as percentages (4.5 = 4.5%),
 * dollars as whole dollars. The compiler converts to HtAG's fractions; the
 * form never does (P1-3 description).
 *
 * A filter that is absent is off. There is no `enabled: false` with a stale
 * value behind it — what is stored is exactly what will be sent.
 */

const percent = z.number().finite().min(0).max(100)

/** Inclusive range with at least one bound; `min ≤ max` when both are set. */
function rangeSchema<T extends z.ZodNumber>(bound: T) {
  return z
    .strictObject({ min: bound.optional(), max: bound.optional() })
    .refine((r) => r.min !== undefined || r.max !== undefined, {
      message: "Set a minimum, a maximum, or both",
    })
    .refine((r) => r.min === undefined || r.max === undefined || r.min <= r.max, {
      message: "Minimum must not be greater than maximum",
      path: ["max"],
    })
}

/**
 * Hard filters (D43, D68). Each maps to one HtAG `logic` leaf. The keys match
 * `PresetFilterDefaults` in `@my-ba/domain`, so a preset prefills them
 * one-to-one (`highConfidenceOnly` ⇔ `confidence: "high"`).
 */
export const criteriaFiltersSchema = z.strictObject({
  /** Typical price, whole AUD. */
  typicalPrice: rangeSchema(z.int().min(0).max(100_000_000)).optional(),
  grossYieldPct: rangeSchema(percent).optional(),
  maxVacancyRatePct: percent.optional(),
  maxStockOnMarketPct: percent.optional(),
  maxDaysOnMarket: z.int().min(1).max(730).optional(),
  /** Cumulative price growth over 36 months, in percent (50 = +50%). Compiled to a 3-year CAGR (D68). */
  maxPriceGrowth36mPct: z.number().finite().min(-100).max(1000).optional(),
  minAnnualSalesVolume: z.int().min(0).max(1_000_000).optional(),
  /** HtAG `irsad` is a decile, 1–10 (Q16 probe, 2026-10-01). */
  minIrsadDecile: z.int().min(1).max(10).optional(),
  /** Defaults on (P1-3). Off emits no confidence leaf. */
  highConfidenceOnly: z.boolean().default(true),
})
export type CriteriaFilters = z.infer<typeof criteriaFiltersSchema>
export type CriteriaFiltersInput = z.input<typeof criteriaFiltersSchema>

/** Filters that count towards the "at least three enabled" Run rule (design brief). */
export const COUNTED_FILTER_KEYS = [
  "typicalPrice",
  "grossYieldPct",
  "maxVacancyRatePct",
  "maxStockOnMarketPct",
  "maxDaysOnMarket",
  "maxPriceGrowth36mPct",
  "minAnnualSalesVolume",
  "minIrsadDecile",
] as const satisfies ReadonlyArray<keyof CriteriaFilters>

export const MIN_ENABLED_FILTERS_TO_RUN = 3

export function countEnabledFilters(filters: Partial<Record<string, unknown>>): number {
  return COUNTED_FILTER_KEYS.filter((key) => filters[key] !== undefined).length
}

/**
 * Investor profile (D18, D19): which preset prefilled the task, the weights it
 * ranks with, and whether either was edited after prefill.
 */
export const investorProfileSchema = z.strictObject({
  strategy: strategySchema,
  risk: riskToleranceSchema,
  /** `PRESET_VERSION` at prefill time. Not pinned to the current one: clones of old tasks must still parse. */
  presetVersion: z.string().min(1),
  weights: weightsSchema,
  weightsCustomised: z.boolean(),
  filtersCustomised: z.boolean(),
})
export type InvestorProfile = z.infer<typeof investorProfileSchema>

const statesSchema = z
  .array(auStateSchema)
  .refine((states) => new Set(states).size === states.length, {
    message: "States must not repeat",
  })

/**
 * Structurally complete criteria, without the Run-only UX rules. This is what
 * `compileToHtagLogic` accepts: the compiler must handle "all filters off"
 * (P1-3 AC 2) even though the form won't run it.
 */
export const criteriaShapeSchema = z.strictObject({
  states: statesSchema.min(1, "Choose at least one state"),
  propertyType: htagPropertyTypeSchema,
  /** HtAG aggregate only for MVP (D40); emitted as the `bedrooms` leaf. */
  bedrooms: z.literal(HTAG_BEDROOMS_ALL).default(HTAG_BEDROOMS_ALL),
  filters: criteriaFiltersSchema,
  profile: investorProfileSchema,
})

/**
 * Full criteria: what "Run" requires (P1-3 AC 1, AC 6). Rejects inverted
 * ranges, empty `states`, unknown keys, invalid weights, and fewer than
 * `MIN_ENABLED_FILTERS_TO_RUN` filters (design brief).
 */
export const criteriaSchema = criteriaShapeSchema.superRefine((criteria, ctx) => {
  if (countEnabledFilters(criteria.filters) < MIN_ENABLED_FILTERS_TO_RUN) {
    ctx.addIssue({
      code: "custom",
      path: ["filters"],
      message: `Enable at least ${MIN_ENABLED_FILTERS_TO_RUN} filters before running`,
    })
  }
})
export type Criteria = z.infer<typeof criteriaSchema>
export type CriteriaInput = z.input<typeof criteriaSchema>

/**
 * Draft criteria (AC 6): anything may be missing, but whatever is present must
 * already be valid — an inverted range or an unknown key is rejected even in a
 * draft. `{}` parses (rows created before P1-3 hold it).
 */
export const draftCriteriaSchema = z.strictObject({
  states: statesSchema.optional(),
  propertyType: htagPropertyTypeSchema.optional(),
  bedrooms: z.literal(HTAG_BEDROOMS_ALL).optional(),
  filters: criteriaFiltersSchema.partial().optional(),
  profile: investorProfileSchema.partial().optional(),
})
export type DraftCriteria = z.infer<typeof draftCriteriaSchema>
