import { PRESET_VERSION, presetWeights } from "@my-ba/domain"
import type { CriteriaInput } from "@my-ba/shared"
import { criteriaShapeSchema } from "@my-ba/shared"
import { describe, expect, it } from "vitest"

import {
  compileScreeningQuery,
  compileToHtagLogic,
  cumulativePctToCagr,
  percentToFraction,
} from "./compile-criteria"

const profile = {
  strategy: "balanced",
  risk: "medium",
  presetVersion: PRESET_VERSION,
  weights: presetWeights("balanced", "medium"),
  weightsCustomised: false,
  filtersCustomised: false,
} as const

const criteria = (patch: Partial<CriteriaInput> = {}) =>
  criteriaShapeSchema.parse({
    states: ["QLD", "NSW"],
    propertyType: "house",
    filters: {},
    profile,
    ...patch,
  })

describe("compileToHtagLogic (AC 2)", () => {
  it("compiles every filter, scaling percents to fractions", () => {
    const logic = compileToHtagLogic(
      criteria({
        filters: {
          typicalPrice: { min: 500_000, max: 900_000 },
          grossYieldPct: { min: 3.5, max: 7 },
          maxVacancyRatePct: 2.5,
          maxStockOnMarketPct: 1.3,
          maxDaysOnMarket: 65,
          maxPriceGrowth36mPct: 50,
          minAnnualSalesVolume: 50,
          minIrsadDecile: 3,
          highConfidenceOnly: true,
        },
      }),
    )
    expect(logic).toEqual({
      and: [
        { field: "bedrooms", eq: "All" },
        { field: "state", in: ["QLD", "NSW"] },
        { field: "confidence", eq: "High" },
        { field: "typical_price", gte: 500_000, lte: 900_000 },
        { field: "gross_yield", gte: 0.035, lte: 0.07 },
        { field: "vacancy_rate", lte: 0.025 },
        { field: "som_percent", lte: 0.013 },
        { field: "dom", lte: 65 },
        { field: "price_3y_cagr", lte: 0.144714 },
        { field: "annual_sales_volume", gte: 50 },
        { field: "irsad", gte: 3 },
      ],
    })
    expect(logic).toMatchSnapshot()
  })

  it("compiles all filters off to bedrooms + state + confidence leaves only", () => {
    expect(compileToHtagLogic(criteria())).toEqual({
      and: [
        { field: "bedrooms", eq: "All" },
        { field: "state", in: ["QLD", "NSW"] },
        { field: "confidence", eq: "High" },
      ],
    })
  })

  it("drops the confidence leaf when high-confidence-only is off", () => {
    const logic = compileToHtagLogic(criteria({ filters: { highConfidenceOnly: false } }))
    expect(logic).toEqual({
      and: [
        { field: "bedrooms", eq: "All" },
        { field: "state", in: ["QLD", "NSW"] },
      ],
    })
  })

  it("emits one-sided ranges with only the bound that is set", () => {
    const logic = compileToHtagLogic(
      criteria({ filters: { typicalPrice: { max: 650_000 }, grossYieldPct: { min: 4.5 } } }),
    )
    expect(logic).toMatchObject({
      and: expect.arrayContaining([
        { field: "typical_price", lte: 650_000 },
        { field: "gross_yield", gte: 0.045 },
      ]),
    })
  })

  it("is deterministic and rejects criteria that aren't structurally complete", () => {
    const c = criteria({ filters: { maxVacancyRatePct: 1.5 } })
    expect(compileToHtagLogic(c)).toEqual(compileToHtagLogic(structuredClone(c)))
    expect(() => compileToHtagLogic({ ...c, states: [] })).toThrow()
  })
})

describe("unit conversion", () => {
  it("percentToFraction rounds float noise away", () => {
    expect(percentToFraction(1.3)).toBe(0.013)
    expect(percentToFraction(4.5)).toBe(0.045)
    expect(percentToFraction(0)).toBe(0)
  })

  it("cumulativePctToCagr", () => {
    expect(cumulativePctToCagr(50, 3)).toBe(0.144714)
    expect(cumulativePctToCagr(0, 3)).toBe(0)
    expect(cumulativePctToCagr(-20, 3)).toBeCloseTo(-0.071682, 6)
  })
})

describe("compileScreeningQuery", () => {
  it("builds a valid /markets/query body", () => {
    const body = compileScreeningQuery(criteria({ propertyType: "unit" }), { limit: 100 })
    expect(body).toMatchObject({ level: "suburb", property_types: ["unit"], limit: 100 })
    expect(body.logic).toEqual(compileToHtagLogic(criteria({ propertyType: "unit" })))
  })
})
