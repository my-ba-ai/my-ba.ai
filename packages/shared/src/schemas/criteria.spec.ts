import { PRESET_VERSION, presetWeights } from "@my-ba/domain"
import { describe, expect, it } from "vitest"

import {
  countEnabledFilters,
  criteriaSchema,
  draftCriteriaSchema,
  type CriteriaInput,
} from "./criteria"
import { savePurchaseTaskRequestSchema } from "./criteria-api"

const VALID: CriteriaInput = {
  states: ["QLD", "NSW"],
  propertyType: "house",
  filters: {
    typicalPrice: { min: 500_000, max: 900_000 },
    grossYieldPct: { min: 4.5 },
    maxVacancyRatePct: 1.5,
    maxStockOnMarketPct: 1.3,
    maxDaysOnMarket: 50,
  },
  profile: {
    strategy: "cashflow",
    risk: "low",
    presetVersion: PRESET_VERSION,
    weights: presetWeights("cashflow", "low"),
    weightsCustomised: false,
    filtersCustomised: true,
  },
}

describe("criteriaSchema (AC 1)", () => {
  it("accepts valid criteria and applies defaults", () => {
    const parsed = criteriaSchema.parse(VALID)
    expect(parsed.bedrooms).toBe("All")
    expect(parsed.filters.highConfidenceOnly).toBe(true)
  })

  it("rejects inverted ranges", () => {
    for (const filters of [
      { ...VALID.filters, typicalPrice: { min: 900_000, max: 500_000 } },
      { ...VALID.filters, grossYieldPct: { min: 6, max: 4 } },
    ]) {
      expect(criteriaSchema.safeParse({ ...VALID, filters }).success).toBe(false)
    }
  })

  it("rejects an empty range", () => {
    const filters = { ...VALID.filters, typicalPrice: {} }
    expect(criteriaSchema.safeParse({ ...VALID, filters }).success).toBe(false)
  })

  it("rejects empty or repeated states", () => {
    expect(criteriaSchema.safeParse({ ...VALID, states: [] }).success).toBe(false)
    expect(criteriaSchema.safeParse({ ...VALID, states: ["QLD", "QLD"] }).success).toBe(false)
    expect(criteriaSchema.safeParse({ ...VALID, states: ["QLD", "NZ"] }).success).toBe(false)
  })

  it("rejects unknown keys at every level", () => {
    expect(criteriaSchema.safeParse({ ...VALID, budget: 1 }).success).toBe(false)
    const filters = { ...VALID.filters, minRenterProportionPct: 20 }
    expect(criteriaSchema.safeParse({ ...VALID, filters }).success).toBe(false)
    const profile = { ...VALID.profile, horizon: "short" }
    expect(criteriaSchema.safeParse({ ...VALID, profile }).success).toBe(false)
  })

  it("rejects invalid weights (P1-8 Weights)", () => {
    const bad = [
      { ...presetWeights("growth", "low"), yield_now: 0.9 },
      { yield_now: 1 },
      { ...presetWeights("growth", "low"), renter_share: 0 },
    ]
    for (const weights of bad) {
      const profile = { ...VALID.profile, weights }
      expect(criteriaSchema.safeParse({ ...VALID, profile }).success).toBe(false)
    }
  })

  it("rejects out-of-range filter values", () => {
    const bad = [
      { maxVacancyRatePct: 101 },
      { maxDaysOnMarket: 0 },
      { maxDaysOnMarket: 12.5 },
      { minIrsadDecile: 11 },
      { minAnnualSalesVolume: -1 },
    ]
    for (const patch of bad) {
      const filters = { ...VALID.filters, ...patch }
      expect(criteriaSchema.safeParse({ ...VALID, filters }).success).toBe(false)
    }
  })

  it("requires at least three counted filters to run (design brief)", () => {
    const filters = { maxVacancyRatePct: 1.5, maxDaysOnMarket: 50, highConfidenceOnly: true }
    expect(countEnabledFilters(filters)).toBe(2)
    expect(criteriaSchema.safeParse({ ...VALID, filters }).success).toBe(false)
    const three = { ...filters, minIrsadDecile: 5 }
    expect(criteriaSchema.safeParse({ ...VALID, filters: three }).success).toBe(true)
  })
})

describe("draftCriteriaSchema (AC 6)", () => {
  it("accepts {} and partial criteria", () => {
    expect(draftCriteriaSchema.parse({})).toEqual({})
    const partial = {
      states: [],
      filters: { maxVacancyRatePct: 2 },
      profile: { strategy: "growth" },
    }
    expect(draftCriteriaSchema.safeParse(partial).success).toBe(true)
  })

  it("still rejects what is present but invalid", () => {
    expect(
      draftCriteriaSchema.safeParse({ filters: { typicalPrice: { min: 2, max: 1 } } }).success,
    ).toBe(false)
    expect(draftCriteriaSchema.safeParse({ vacancyMax: 1 }).success).toBe(false)
    expect(draftCriteriaSchema.safeParse({ profile: { weights: { yield_now: 2 } } }).success).toBe(
      false,
    )
  })

  it("accepts every full criteria value (full ⊂ draft)", () => {
    expect(draftCriteriaSchema.safeParse(criteriaSchema.parse(VALID)).success).toBe(true)
  })
})

describe("savePurchaseTaskRequestSchema (AC 6)", () => {
  it("saves a draft with partial criteria", () => {
    const body = { intent: "draft", name: "QLD cashflow", criteria: { states: ["QLD"] } }
    expect(savePurchaseTaskRequestSchema.safeParse(body).success).toBe(true)
  })

  it("requires full criteria for run", () => {
    const partial = { intent: "run", name: "QLD cashflow", criteria: { states: ["QLD"] } }
    expect(savePurchaseTaskRequestSchema.safeParse(partial).success).toBe(false)
    const full = { intent: "run", name: "QLD cashflow", criteria: VALID }
    expect(savePurchaseTaskRequestSchema.safeParse(full).success).toBe(true)
  })

  it("trims and requires a name, and rejects unknown intents", () => {
    const blank = { intent: "draft", name: "   ", criteria: {} }
    expect(savePurchaseTaskRequestSchema.safeParse(blank).success).toBe(false)
    const intent = { intent: "screen", name: "x", criteria: {} }
    expect(savePurchaseTaskRequestSchema.safeParse(intent).success).toBe(false)
  })
})
