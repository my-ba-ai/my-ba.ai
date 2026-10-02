import { PRESET_VERSION, presetWeights } from "@my-ba/domain"
import { criteriaSchema } from "@my-ba/shared"
import { describe, expect, it } from "vitest"

import {
  applyPreset,
  criteriaFormSchema,
  draftToFormValues,
  emptyFormValues,
  filtersCustomised,
  formToDraftCriteria,
  runBlockers,
  weightsCustomised,
} from "./criteria-form"

const prefilled = () => {
  const values = applyPreset(emptyFormValues(), "cashflow", "low")
  return { ...values, name: "QLD cashflow", states: ["QLD" as const] }
}

describe("applyPreset (P1-3 step 1)", () => {
  it("prefills preset filters and weights, keeps the investor's price band", () => {
    const base = emptyFormValues()
    base.filters.typicalPrice = { enabled: true, min: 600_000, max: 800_000 }
    const values = applyPreset(base, "cashflow", "low")
    expect(values.filters.grossYieldPct).toEqual({ enabled: true, min: 4.5 })
    expect(values.filters.maxVacancyRatePct).toEqual({ enabled: true, value: 1.5 })
    expect(values.filters.maxDaysOnMarket).toEqual({ enabled: true, value: 50 })
    expect(values.filters.typicalPrice).toEqual({ enabled: true, min: 600_000, max: 800_000 })
    expect(values.highConfidenceOnly).toBe(true)
    expect(values.weights.yield_now).toBe(37.5)
    expect(values.presetVersion).toBe(PRESET_VERSION)
  })

  it("switches preset-governed filters off where the new preset has none", () => {
    const values = applyPreset(prefilled(), "growth", "high")
    expect(values.filters.grossYieldPct.enabled).toBe(false)
    expect(values.filters.minIrsadDecile.enabled).toBe(false)
    expect(values.filters.maxPriceGrowth36mPct.enabled).toBe(false)
    expect(values.highConfidenceOnly).toBe(false)
  })
})

describe("customised flags (P1-3 AC 3)", () => {
  it("are false straight after prefill", () => {
    const values = prefilled()
    expect(filtersCustomised(values)).toBe(false)
    expect(weightsCustomised(values)).toBe(false)
  })

  it("editing any preset-prefilled filter sets filtersCustomised", () => {
    const edits: Array<(v: ReturnType<typeof prefilled>) => void> = [
      (v) => (v.filters.maxVacancyRatePct = { enabled: true, value: 2 }),
      (v) => (v.filters.maxDaysOnMarket = { ...v.filters.maxDaysOnMarket, enabled: false }),
      (v) => (v.filters.grossYieldPct = { enabled: true, min: 4.5, max: 8 }),
      (v) => (v.highConfidenceOnly = false),
    ]
    for (const edit of edits) {
      const values = prefilled()
      edit(values)
      expect(filtersCustomised(values)).toBe(true)
    }
  })

  it("editing the price band is not a preset customisation", () => {
    const values = prefilled()
    values.filters.typicalPrice = { enabled: true, min: 400_000, max: 600_000 }
    expect(filtersCustomised(values)).toBe(false)
  })

  it("putting a value back is not a customisation (diff, not touched)", () => {
    const values = prefilled()
    values.filters.maxVacancyRatePct = { enabled: true, value: 1.5 }
    expect(filtersCustomised(values)).toBe(false)
  })

  it("editing any weight sets weightsCustomised; uniform scaling does not", () => {
    const values = prefilled()
    values.weights = { ...values.weights, yield_now: values.weights.yield_now + 10 }
    expect(weightsCustomised(values)).toBe(true)
    const scaled = prefilled()
    for (const id of Object.keys(scaled.weights) as Array<keyof typeof scaled.weights>) {
      scaled.weights[id] = scaled.weights[id] / 2
    }
    expect(weightsCustomised(scaled)).toBe(false)
  })
})

describe("formToDraftCriteria / draftToFormValues", () => {
  it("stores only enabled filters, normalised weights and the flags", () => {
    const values = prefilled()
    values.filters.typicalPrice = { enabled: true, min: 500_000, max: 900_000 }
    values.filters.minIrsadDecile = { ...values.filters.minIrsadDecile, enabled: false }
    const draft = formToDraftCriteria(values)
    expect(draft.filters).toEqual({
      typicalPrice: { min: 500_000, max: 900_000 },
      grossYieldPct: { min: 4.5 },
      maxVacancyRatePct: 1.5,
      maxStockOnMarketPct: 1.3,
      maxDaysOnMarket: 50,
      maxPriceGrowth36mPct: 50,
      minAnnualSalesVolume: 100,
      highConfidenceOnly: true,
    })
    expect(draft.profile).toMatchObject({
      strategy: "cashflow",
      risk: "low",
      presetVersion: PRESET_VERSION,
      weightsCustomised: false,
      filtersCustomised: true,
    })
    const weights = draft.profile?.weights
    expect(weights?.yield_now).toBeCloseTo(presetWeights("cashflow", "low").yield_now, 3)
    expect(criteriaSchema.safeParse(draft).success).toBe(true)
  })

  it("drops a NaN (emptied input) instead of storing it", () => {
    const values = prefilled()
    values.filters.maxDaysOnMarket = { enabled: true, value: Number.NaN }
    values.filters.typicalPrice = { enabled: true, min: Number.NaN, max: 700_000 }
    const draft = formToDraftCriteria(values)
    expect(draft.filters?.maxDaysOnMarket).toBeUndefined()
    expect(draft.filters?.typicalPrice).toEqual({ max: 700_000 })
  })

  it("saves an almost-empty draft (AC 6)", () => {
    const draft = formToDraftCriteria({ ...emptyFormValues(), name: "Later" })
    expect(draft).toEqual({
      states: [],
      propertyType: "house",
      bedrooms: "All",
      filters: { highConfidenceOnly: true },
      profile: {},
    })
  })

  it("round-trips a saved draft into the form (edit, clone pre-fill — AC 7)", () => {
    const values = prefilled()
    values.filters.typicalPrice = { enabled: true, min: 500_000, max: 900_000 }
    const draft = formToDraftCriteria(values)
    const back = draftToFormValues("QLD cashflow", draft)
    expect(formToDraftCriteria(back)).toEqual(draft)
    expect(back.filters.minIrsadDecile.enabled).toBe(true)
    expect(back.filters.typicalPrice).toEqual({ enabled: true, min: 500_000, max: 900_000 })
  })

  it("opens a pre-P1-3 empty draft with defaults", () => {
    const values = draftToFormValues("Old task", {})
    expect(values).toMatchObject({ name: "Old task", strategy: null, states: [] })
    expect(values.filters.maxVacancyRatePct.enabled).toBe(false)
  })
})

describe("validation", () => {
  it("the form schema rejects an inverted range and an empty enabled filter", () => {
    const values = prefilled()
    values.filters.typicalPrice = { enabled: true, min: 900_000, max: 500_000 }
    values.filters.maxDaysOnMarket = { enabled: true, value: Number.NaN }
    const result = criteriaFormSchema.safeParse(values)
    expect(result.success).toBe(false)
    const paths = result.success ? [] : result.error.issues.map((i) => i.path.join("."))
    expect(paths).toEqual(
      expect.arrayContaining(["filters.typicalPrice.max", "filters.maxDaysOnMarket.value"]),
    )
  })

  it("runBlockers explains what stands between a draft and Run", () => {
    expect(runBlockers(prefilled())).toEqual([])
    const empty = { ...emptyFormValues(), name: "x" }
    expect(runBlockers(empty)).toEqual([
      "Choose a strategy and a risk tolerance",
      "Choose at least one state",
      "Enable at least 3 filters (0 on)",
      "Set at least one ranking weight above zero",
    ])
  })

  it("the form schema lets a draft without a preset (all-zero weights) save", () => {
    expect(criteriaFormSchema.safeParse({ ...emptyFormValues(), name: "Later" }).success).toBe(true)
  })
})
