import type { HtagTier, ScreeningCostEstimate } from "@my-ba/shared"

import { DEFAULT_HTAG_TIER_RATES_AUD } from "./config"

/**
 * Shape of one screening run (P1-4, D42, D68) — the inputs to its cost
 * ceiling. P1-4 owns the live config; these defaults mirror the roadmap.
 */
export interface ScreeningShape {
  /** `SCREEN_QUERY_LIMIT`: max rows from `/markets/query`. */
  queryLimit: number
  /** `SCREEN_RESTRICTED_TOP_N`: suburbs that get Restricted-tier hydration. */
  restrictedTopN: number
  /** Reference-tier trend points per survivor (D68: 37 / 13 / 1). */
  pricePoints: number
  rentPoints: number
  yieldPoints: number
  /** Restricted metrics hydrated per top-N suburb (SOM, DOM, vacancy), latest period each. */
  restrictedMetrics: number
}

export const DEFAULT_SCREENING_SHAPE: Readonly<ScreeningShape> = {
  queryLimit: 100,
  restrictedTopN: 6,
  pricePoints: 37,
  rentPoints: 13,
  yieldPoints: 1,
  restrictedMetrics: 3,
}

/** D16: MVP per-task HtAG budget. */
export const SCREENING_BUDGET_AUD = 20

/**
 * Worst-case cost of one screening run: every query row returned, no cached
 * trend rows, no free allowance, at the configured per-row rates. A ceiling
 * for the review step, not a forecast — the ledger (D62) records the truth.
 */
export function estimateScreeningCostCeiling(
  shape: ScreeningShape = DEFAULT_SCREENING_SHAPE,
  rates: Readonly<Partial<Record<HtagTier, number>>> = DEFAULT_HTAG_TIER_RATES_AUD,
): ScreeningCostEstimate {
  const rate = (tier: HtagTier) => {
    const value = rates[tier]
    if (value === undefined) throw new RangeError(`No per-row rate configured for tier ${tier}`)
    return value
  }
  const line = (label: string, tier: HtagTier, rows: number) => ({
    label,
    tier,
    rows,
    rateAud: rate(tier),
    costAud: roundCents(rows * rate(tier)),
  })

  const trendRows = shape.pricePoints + shape.rentPoints + shape.yieldPoints
  const lines = [
    line("Suburb query", "premium", shape.queryLimit),
    line("Price, rent and yield history", "reference", shape.queryLimit * trendRows),
    line(
      "Supply detail for top suburbs",
      "restricted",
      shape.restrictedTopN * shape.restrictedMetrics,
    ),
  ]

  return {
    ceilingAud: roundCents(lines.reduce((sum, l) => sum + l.costAud, 0)),
    budgetAud: SCREENING_BUDGET_AUD,
    lines,
  }
}

const roundCents = (value: number) => Math.round(value * 100) / 100
