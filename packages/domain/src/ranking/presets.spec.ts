import { describe, expect, it } from "vitest"

import {
  FACTOR_IDS,
  PRESET_VERSION,
  RISK_TOLERANCES,
  STRATEGIES,
  normaliseWeights,
  presetFilterDefaults,
  presetWeights,
  sumWeights,
  weightsSchema,
  zeroWeights,
} from "./presets"

const combos = STRATEGIES.flatMap((strategy) =>
  RISK_TOLERANCES.map((risk) => [strategy, risk] as const),
)

describe("presetWeights (AC 1)", () => {
  it.each(combos)("%s × %s sums to 1 and passes weightsSchema", (strategy, risk) => {
    const weights = presetWeights(strategy, risk)
    expect(Math.abs(sumWeights(weights) - 1)).toBeLessThanOrEqual(1e-9)
    expect(weightsSchema.safeParse(weights).success).toBe(true)
  })

  it("snapshots all 9 presets", () => {
    const table = Object.fromEntries(
      combos.map(([s, r]) => [
        `${s}/${r}`,
        Object.fromEntries(FACTOR_IDS.map((id) => [id, round(presetWeights(s, r)[id])])),
      ]),
    )
    expect({ PRESET_VERSION, table }).toMatchSnapshot()
  })

  it("scales the base vector by 1 − low_volatility", () => {
    const w = presetWeights("growth", "low")
    expect(w.low_volatility).toBe(0.25)
    expect(w.rent_growth_12m).toBeCloseTo(0.35 * 0.75, 12)
    expect(presetWeights("cashflow", "high").low_volatility).toBe(0)
  })

  it("growth leans on rent growth and the 36-month ceiling; cashflow on yield", () => {
    const growth = presetWeights("growth", "high")
    expect(growth.rent_growth_12m).toBe(0.35)
    expect(growth.price_growth_36m).toBe(0.3)
    expect(presetWeights("cashflow", "high").yield_now).toBe(0.5)
  })
})

describe("weightsSchema (AC 6, as amended by D68)", () => {
  const valid = presetWeights("balanced", "medium")

  it("rejects all-zero", () => {
    expect(weightsSchema.safeParse(zeroWeights()).success).toBe(false)
  })

  it("rejects a vector that doesn't sum to 1", () => {
    expect(weightsSchema.safeParse({ ...valid, yield_now: valid.yield_now + 0.1 }).success).toBe(
      false,
    )
  })

  it("rejects negatives, unknown keys and missing keys", () => {
    expect(weightsSchema.safeParse({ ...valid, yield_now: -0.1 }).success).toBe(false)
    expect(weightsSchema.safeParse({ ...valid, rcs_overall: 0 }).success).toBe(false)
    expect(weightsSchema.safeParse({ ...valid, owner_share: 0 }).success).toBe(false)
    const { low_volatility: _omit, ...missing } = valid
    expect(weightsSchema.safeParse(missing).success).toBe(false)
  })
})

describe("normaliseWeights", () => {
  it("scales slider values to sum to 1", () => {
    const w = normaliseWeights({ ...zeroWeights(), yield_now: 3, rent_growth_12m: 1 })
    expect(w.yield_now).toBe(0.75)
    expect(w.rent_growth_12m).toBe(0.25)
    expect(weightsSchema.safeParse(w).success).toBe(true)
  })

  it("throws on all-zero or negative input", () => {
    expect(() => normaliseWeights(zeroWeights())).toThrow(RangeError)
    expect(() => normaliseWeights({ ...zeroWeights(), yield_now: -1, rent_growth_12m: 2 })).toThrow(
      RangeError,
    )
  })
})

describe("presetFilterDefaults (D19, D68)", () => {
  it("combines the strategy yield floor with the risk floors", () => {
    expect(presetFilterDefaults("cashflow", "low")).toEqual({
      minGrossYieldPct: 4.5,
      confidence: "high",
      minIrsadDecile: 5,
      maxVacancyRatePct: 1.5,
      maxStockOnMarketPct: 1.3,
      maxDaysOnMarket: 50,
      maxPriceGrowth36mPct: 50,
      minAnnualSalesVolume: 100,
    })
    expect(presetFilterDefaults("growth", "high")).toEqual({
      confidence: "any",
      maxVacancyRatePct: 4,
      maxStockOnMarketPct: 2,
      maxDaysOnMarket: 90,
      minAnnualSalesVolume: 20,
    })
    expect(presetFilterDefaults("balanced", "medium")).toMatchObject({
      minGrossYieldPct: 3.5,
      maxDaysOnMarket: 65,
      maxPriceGrowth36mPct: 50,
    })
  })

  it("returns a fresh object each call", () => {
    const a = presetFilterDefaults("balanced", "low")
    a.maxVacancyRatePct = 99
    expect(presetFilterDefaults("balanced", "low").maxVacancyRatePct).toBe(1.5)
  })
})

function round(n: number): number {
  return Math.round(n * 1e9) / 1e9
}
