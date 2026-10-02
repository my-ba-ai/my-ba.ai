import {
  FACTOR_IDS,
  type FactorId,
  PRESET_VERSION,
  type RiskTolerance,
  type Strategy,
  normaliseWeights,
  presetFilterDefaults,
  presetWeights,
  riskToleranceSchema,
  strategySchema,
  sumWeights,
} from "@my-ba/domain"
import {
  COUNTED_FILTER_KEYS,
  type DraftCriteria,
  type HtagPropertyType,
  MIN_ENABLED_FILTERS_TO_RUN,
  auStateSchema,
  criteriaSchema,
  draftCriteriaSchema,
  htagPropertyTypeSchema,
} from "@my-ba/shared"
import { z } from "zod"

/**
 * Form state for the P1-3 criteria form, and the pure conversions between it
 * and the stored `DraftCriteria`. The form keeps a value behind every toggle
 * (so switching a filter off and on again restores it); only enabled filters
 * are stored (`criteria.ts`: "what is stored is exactly what will be sent").
 */

export type FilterKey = (typeof COUNTED_FILTER_KEYS)[number]

type FilterKind = "range" | "max" | "min"

export interface FilterDefinition {
  /** The `CriteriaFilters` field this row edits. */
  field: FilterKey
  kind: FilterKind
  label: string
  /** Shown after the input(s). */
  unit: "AUD" | "%" | "days" | "sales / yr" | "decile"
  helper: string
  step: number
  integer: boolean
  /** Value a filter gets when switched on with no preset value behind it. */
  initial: { min?: number; max?: number; value?: number }
  /** Prefilled by strategy × risk presets (D19, D68). Typical price is the investor's own. */
  fromPreset: boolean
}

export const FILTER_DEFINITIONS: readonly FilterDefinition[] = [
  {
    field: "typicalPrice",
    kind: "range",
    label: "Typical price",
    unit: "AUD",
    helper: "Your budget band. HtAG's typical price for the property type, not a listing price.",
    step: 25_000,
    integer: true,
    initial: { min: 500_000, max: 900_000 },
    fromPreset: false,
  },
  {
    field: "grossYieldPct",
    kind: "range",
    label: "Gross yield",
    unit: "%",
    helper: "Annual rent ÷ typical price. Cashflow and balanced presets set a floor.",
    step: 0.1,
    integer: false,
    initial: { min: 4 },
    fromPreset: true,
  },
  {
    field: "maxVacancyRatePct",
    kind: "max",
    label: "Vacancy rate, max",
    unit: "%",
    helper: "Higher vacancy means longer gaps between tenants.",
    step: 0.1,
    integer: false,
    initial: { value: 2 },
    fromPreset: true,
  },
  {
    field: "maxStockOnMarketPct",
    kind: "max",
    label: "Stock on market, max",
    unit: "%",
    helper: "Listings as a share of dwellings. High stock caps price growth.",
    step: 0.1,
    integer: false,
    initial: { value: 1.3 },
    fromPreset: true,
  },
  {
    field: "maxDaysOnMarket",
    kind: "max",
    label: "Days on market, max",
    unit: "days",
    helper: "Long selling times signal more supply than demand.",
    step: 1,
    integer: true,
    initial: { value: 65 },
    fromPreset: true,
  },
  {
    field: "maxPriceGrowth36mPct",
    kind: "max",
    label: "Price growth over 36 months, max",
    unit: "%",
    helper: "Screens out suburbs that may already be near the peak of their cycle.",
    step: 1,
    integer: false,
    initial: { value: 50 },
    fromPreset: true,
  },
  {
    field: "minAnnualSalesVolume",
    kind: "min",
    label: "Annual sales, min",
    unit: "sales / yr",
    helper: "Thin markets make prices noisy and resale slow.",
    step: 10,
    integer: true,
    initial: { value: 50 },
    fromPreset: true,
  },
  {
    field: "minIrsadDecile",
    kind: "min",
    label: "Socio-economic decile, min",
    unit: "decile",
    helper: "ABS IRSAD, 1 (most disadvantaged) to 10 (most advantaged).",
    step: 1,
    integer: true,
    initial: { value: 3 },
    fromPreset: true,
  },
]

export const FILTER_BY_KEY = Object.fromEntries(
  FILTER_DEFINITIONS.map((d) => [d.field, d]),
) as Readonly<Record<FilterKey, FilterDefinition>>

export const STRATEGY_LABELS: Readonly<Record<Strategy, { label: string; blurb: string }>> = {
  growth: { label: "Growth", blurb: "Rents rising, not yet peaked, healthy renter mix." },
  cashflow: { label: "Cashflow", blurb: "Yield first. A 4.5% gross yield floor." },
  balanced: { label: "Balanced", blurb: "Yield and growth weighted evenly. 3.5% yield floor." },
}

export const RISK_LABELS: Readonly<Record<RiskTolerance, { label: string; blurb: string }>> = {
  low: { label: "Low", blurb: "Tight supply limits, high-confidence data, steadier prices." },
  medium: { label: "Medium", blurb: "Moderate limits. The default for most investors." },
  high: { label: "High", blurb: "Looser limits and lower-confidence data allowed." },
}

export const FACTOR_LABELS: Readonly<Record<FactorId, string>> = {
  yield_now: "Gross yield",
  rent_growth_12m: "Rent growth, 12 months",
  price_growth_36m: "Not near the peak (36-month growth)",
  renter_band: "Renter share 15–35%",
  low_volatility: "Price stability",
}

export const PROPERTY_TYPE_LABELS: Readonly<Record<HtagPropertyType, string>> = {
  house: "House",
  unit: "Unit",
}

/* ------------------------------------------------------------- values */

/** `NaN` allowed: an emptied `valueAsNumber` input yields it, and the refinement below reports it. */
const optionalNumber = z.union([z.number(), z.nan()]).optional()

export const filterFormValueSchema = z.object({
  enabled: z.boolean(),
  min: optionalNumber,
  max: optionalNumber,
  value: optionalNumber,
})
export type FilterFormValue = z.infer<typeof filterFormValueSchema>

/** Slider positions, 0–100. Normalised to sum to 1 only on save. */
const weightsFormSchema = z.object(
  Object.fromEntries(FACTOR_IDS.map((id) => [id, z.number().min(0).max(100)])) as Record<
    FactorId,
    z.ZodNumber
  >,
)

/** `NaN` is what an emptied `valueAsNumber` input yields: treat it as "not set". */
const isSet = (n: number | undefined): n is number => n !== undefined && !Number.isNaN(n)

export const criteriaFormSchema = z
  .object({
    name: z.string().trim().min(1, "Name the task").max(120, "Keep the name under 120 characters"),
    strategy: strategySchema.nullable(),
    risk: riskToleranceSchema.nullable(),
    states: z.array(auStateSchema),
    propertyType: htagPropertyTypeSchema.nullable(),
    filters: z.object(
      Object.fromEntries(COUNTED_FILTER_KEYS.map((k) => [k, filterFormValueSchema])) as Record<
        FilterKey,
        typeof filterFormValueSchema
      >,
    ),
    highConfidenceOnly: z.boolean(),
    weights: weightsFormSchema,
    presetVersion: z.string().nullable(),
  })
  .superRefine((values, ctx) => {
    const issue = (path: Array<string>, message: string) =>
      ctx.addIssue({ code: "custom", path, message })
    for (const def of FILTER_DEFINITIONS) {
      const f = values.filters[def.field]
      if (!f.enabled) continue
      if (def.kind === "range") {
        if (!isSet(f.min) && !isSet(f.max)) {
          issue(["filters", def.field, "min"], "Set a minimum, a maximum, or both")
        } else if (isSet(f.min) && isSet(f.max) && f.min > f.max) {
          issue(["filters", def.field, "max"], "Maximum must not be below the minimum")
        }
      } else if (!isSet(f.value)) {
        issue(["filters", def.field, "value"], "Enter a value or switch this filter off")
      }
    }
    // No all-zero-weights check here: a draft saved before choosing a preset has
    // no weights at all (AC 6). `runBlockers` reports it for Run instead.
  })
export type CriteriaFormValues = z.infer<typeof criteriaFormSchema>

/* ------------------------------------------------------------ presets */

function emptyFilters(): CriteriaFormValues["filters"] {
  return Object.fromEntries(
    FILTER_DEFINITIONS.map((d) => [d.field, { enabled: false, ...d.initial }]),
  ) as CriteriaFormValues["filters"]
}

function zeroSliderWeights(): Record<FactorId, number> {
  return Object.fromEntries(FACTOR_IDS.map((id) => [id, 0])) as Record<FactorId, number>
}

/** Fraction weights → 0–100 slider positions, to two decimals (exact for every preset). */
function toSlider(weights: Readonly<Record<FactorId, number>>): Record<FactorId, number> {
  const out = zeroSliderWeights()
  for (const id of FACTOR_IDS) out[id] = Math.round(weights[id] * 10_000) / 100
  return out
}

export function emptyFormValues(): CriteriaFormValues {
  return {
    name: "",
    strategy: null,
    risk: null,
    states: [],
    propertyType: "house",
    filters: emptyFilters(),
    highConfidenceOnly: true,
    weights: zeroSliderWeights(),
    presetVersion: null,
  }
}

/**
 * The filter values a preset would set, keyed like the form (D19, D68).
 * Typical price is never touched: it is the investor's budget, not a preset's.
 */
export function presetFormFilters(
  strategy: Strategy,
  risk: RiskTolerance,
): { filters: Partial<CriteriaFormValues["filters"]>; highConfidenceOnly: boolean } {
  const p = presetFilterDefaults(strategy, risk)
  const max = (value: number | undefined, key: FilterKey): FilterFormValue =>
    value === undefined
      ? { enabled: false, ...FILTER_BY_KEY[key].initial }
      : { enabled: true, value }
  return {
    filters: {
      grossYieldPct:
        p.minGrossYieldPct === undefined
          ? { enabled: false, ...FILTER_BY_KEY.grossYieldPct.initial }
          : { enabled: true, min: p.minGrossYieldPct },
      maxVacancyRatePct: max(p.maxVacancyRatePct, "maxVacancyRatePct"),
      maxStockOnMarketPct: max(p.maxStockOnMarketPct, "maxStockOnMarketPct"),
      maxDaysOnMarket: max(p.maxDaysOnMarket, "maxDaysOnMarket"),
      maxPriceGrowth36mPct: max(p.maxPriceGrowth36mPct, "maxPriceGrowth36mPct"),
      minAnnualSalesVolume: max(p.minAnnualSalesVolume, "minAnnualSalesVolume"),
      minIrsadDecile: max(p.minIrsadDecile, "minIrsadDecile"),
    },
    highConfidenceOnly: p.confidence === "high",
  }
}

/** Apply a preset: prefill preset-governed filters and the weights; keep everything else. */
export function applyPreset(
  values: CriteriaFormValues,
  strategy: Strategy,
  risk: RiskTolerance,
): CriteriaFormValues {
  const preset = presetFormFilters(strategy, risk)
  return {
    ...values,
    strategy,
    risk,
    filters: { ...values.filters, ...preset.filters },
    highConfidenceOnly: preset.highConfidenceOnly,
    weights: toSlider(presetWeights(strategy, risk)),
    presetVersion: PRESET_VERSION,
  }
}

/* --------------------------------------------------- customised flags */

/** What a filter will actually send: `undefined` when off. */
function effective(f: FilterFormValue, def: FilterDefinition) {
  if (!f.enabled) return undefined
  return def.kind === "range"
    ? { min: isSet(f.min) ? f.min : undefined, max: isSet(f.max) ? f.max : undefined }
    : isSet(f.value)
      ? f.value
      : undefined
}

/**
 * D19 `filtersCustomised`: true when any preset-governed filter, as it would be
 * sent, differs from what the preset sets. Diff-based rather than "was touched",
 * so editing a value and putting it back is not a customisation.
 */
export function filtersCustomised(values: CriteriaFormValues): boolean {
  if (!values.strategy || !values.risk) return false
  const preset = presetFormFilters(values.strategy, values.risk)
  if (preset.highConfidenceOnly !== values.highConfidenceOnly) return true
  return FILTER_DEFINITIONS.filter((d) => d.fromPreset).some((def) => {
    const presetValue = preset.filters[def.field]
    /* c8 ignore next -- every fromPreset key is in presetFormFilters */
    if (!presetValue) return false
    return (
      JSON.stringify(effective(values.filters[def.field], def)) !==
      JSON.stringify(effective(presetValue, def))
    )
  })
}

/** D19 `weightsCustomised`: normalised weights differ from the preset's. */
export function weightsCustomised(values: CriteriaFormValues): boolean {
  if (!values.strategy || !values.risk) return false
  if (sumWeights(values.weights) === 0) return true
  const current = normaliseWeights(values.weights)
  const preset = presetWeights(values.strategy, values.risk)
  return FACTOR_IDS.some((id) => Math.abs(current[id] - preset[id]) > 0.0001)
}

/* --------------------------------------------------------- conversion */

/**
 * Form → stored draft. Only enabled filters with a value go in; weights are
 * normalised to sum to 1 (P1-3: "normalised to 1 on save"). The result is
 * parsed, so a draft that would fail the API fails here first.
 */
export function formToDraftCriteria(values: CriteriaFormValues): DraftCriteria {
  const filters: Record<string, unknown> = {}
  for (const def of FILTER_DEFINITIONS) {
    const value = effective(values.filters[def.field], def)
    if (value === undefined) continue
    if (typeof value === "object" && value.min === undefined && value.max === undefined) continue
    filters[def.field] =
      typeof value === "object"
        ? Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined))
        : value
  }
  filters["highConfidenceOnly"] = values.highConfidenceOnly

  const profile: Record<string, unknown> = {}
  if (values.strategy) profile["strategy"] = values.strategy
  if (values.risk) profile["risk"] = values.risk
  if (values.presetVersion) profile["presetVersion"] = values.presetVersion
  if (sumWeights(values.weights) > 0) profile["weights"] = normaliseWeights(values.weights)
  if (values.strategy && values.risk) {
    profile["weightsCustomised"] = weightsCustomised(values)
    profile["filtersCustomised"] = filtersCustomised(values)
  }

  return draftCriteriaSchema.parse({
    states: values.states,
    ...(values.propertyType ? { propertyType: values.propertyType } : {}),
    bedrooms: "All",
    filters,
    profile,
  })
}

/** Stored draft → form (edit a draft; clone pre-fill, P1-3 AC 7). */
export function draftToFormValues(name: string, draft: DraftCriteria): CriteriaFormValues {
  const base = emptyFormValues()
  const filters = { ...base.filters }
  const stored = draft.filters ?? {}
  for (const def of FILTER_DEFINITIONS) {
    const value = stored[def.field]
    if (value === undefined) continue
    filters[def.field] =
      typeof value === "number" ? { enabled: true, value } : { enabled: true, ...value }
  }
  const profile = draft.profile ?? {}
  return {
    name,
    strategy: profile.strategy ?? null,
    risk: profile.risk ?? null,
    states: [...(draft.states ?? [])],
    propertyType: draft.propertyType ?? base.propertyType,
    filters,
    highConfidenceOnly: stored.highConfidenceOnly ?? true,
    weights: profile.weights ? toSlider(profile.weights) : base.weights,
    presetVersion: profile.presetVersion ?? null,
  }
}

/** Why "Run" would be refused right now, in the user's words. Empty means runnable. */
export function runBlockers(values: CriteriaFormValues): string[] {
  const blockers: string[] = []
  if (!values.strategy || !values.risk) blockers.push("Choose a strategy and a risk tolerance")
  if (values.states.length === 0) blockers.push("Choose at least one state")
  if (!values.propertyType) blockers.push("Choose a property type")
  const enabled = FILTER_DEFINITIONS.filter(
    (d) => effective(values.filters[d.field], d) !== undefined,
  ).length
  if (enabled < MIN_ENABLED_FILTERS_TO_RUN) {
    blockers.push(`Enable at least ${MIN_ENABLED_FILTERS_TO_RUN} filters (${enabled} on)`)
  }
  if (sumWeights(values.weights) === 0) {
    blockers.push("Set at least one ranking weight above zero")
  }
  if (blockers.length > 0) return blockers
  const parsed = criteriaSchema.safeParse(safeDraft(values))
  return parsed.success ? [] : parsed.error.issues.map((issue) => issue.message)
}

function safeDraft(values: CriteriaFormValues): unknown {
  try {
    return formToDraftCriteria(values)
  } catch {
    return null
  }
}
