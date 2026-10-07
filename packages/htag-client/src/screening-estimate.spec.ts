import { screeningCostEstimateSchema } from "@my-ba/shared"
import { describe, expect, it } from "vitest"

import {
  DEFAULT_SCREENING_SHAPE,
  SCREENING_BUDGET_AUD,
  estimateScreeningCostCeiling,
} from "./screening-estimate"

describe("estimateScreeningCostCeiling", () => {
  it("prices the default shape at the default rates", () => {
    const estimate = estimateScreeningCostCeiling()
    expect(screeningCostEstimateSchema.parse(estimate)).toEqual(estimate)
    expect(estimate.lines.map((l) => [l.tier, l.rows, l.costAud])).toEqual([
      ["premium", 100, 12.1],
      ["reference", 5100, 10.2],
      ["restricted", 18, 4],
    ])
    expect(estimate.ceilingAud).toBe(26.3)
    expect(estimate.budgetAud).toBe(SCREENING_BUDGET_AUD)
  })

  it("scales with the shape and rates", () => {
    const estimate = estimateScreeningCostCeiling(
      { ...DEFAULT_SCREENING_SHAPE, queryLimit: 80 },
      { premium: 0.1, reference: 0.001, restricted: 0.2 },
    )
    expect(estimate.ceilingAud).toBe(15.68)
  })

  it("throws when a needed rate is missing", () => {
    expect(() => estimateScreeningCostCeiling(DEFAULT_SCREENING_SHAPE, { premium: 0.1 })).toThrow(
      /reference/,
    )
  })
})
