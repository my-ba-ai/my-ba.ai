import type { FactorId, RawMetrics } from "@my-ba/domain"
import type { HtagTrendMetric } from "@my-ba/htag-client"
import { monthKey, monthsBetween, shiftMonths, type MonthKey } from "./periods"

/**
 * Reference-tier series the ranking reads (P1-4 step 4, D68), and the
 * `suburb_metrics_ts.metric_name` each lands under. Names stay HtAG's field
 * names (P1-1). `points` is how many monthly points ending at the suburb's
 * current period are needed.
 */
export const REFERENCE_SERIES = [
  { metric: "price", field: "typical_price", points: 37, alsoStore: ["sales"] },
  { metric: "rent", field: "median_rent", points: 13, alsoStore: ["rentals"] },
  { metric: "yield", field: "yield_val", points: 1, alsoStore: [] },
] as const satisfies ReadonlyArray<{
  metric: HtagTrendMetric
  field: string
  points: number
  alsoStore: readonly string[]
}>

/** Restricted-tier supply detail for the top N, latest period only (step 7). */
export const SUPPLY_SERIES = [
  { metric: "stock-on-market", field: "som_percent", alsoStore: ["som"] },
  { metric: "days-on-market", field: "dom", alsoStore: ["discounting"] },
  { metric: "vacancy", field: "vacancy_rate", alsoStore: [] },
] as const satisfies ReadonlyArray<{
  metric: HtagTrendMetric
  field: string
  alsoStore: readonly string[]
}>

/** Below this many monthly price points a suburb has no volatility (AC 6). */
export const MIN_VOLATILITY_POINTS = 18

/** Month → value for one metric of one suburb. */
export type MonthlySeries = ReadonlyMap<MonthKey, number>

/**
 * `priceVolatility` (decided 2026-10-09): the sample standard deviation of
 * month-over-month % changes in `typical_price` over the 37-month window
 * ending at the current period. Only consecutive months form a change, so a
 * gap shortens the sample rather than inventing a two-month jump. Null with
 * fewer than 18 points in the window, or fewer than two changes.
 */
export function priceVolatility(prices: MonthlySeries, current: MonthKey): number | null {
  const window = windowPoints(prices, current, 37)
  if (window.length < MIN_VOLATILITY_POINTS) return null
  const changes: number[] = []
  for (let i = 1; i < window.length; i++) {
    const [prevMonth, prev] = window[i - 1]!
    const [month, value] = window[i]!
    if (monthsBetween(prevMonth, month) === 1 && prev > 0) changes.push(value / prev - 1)
  }
  if (changes.length < 2) return null
  const mean = changes.reduce((sum, c) => sum + c, 0) / changes.length
  const variance = changes.reduce((sum, c) => sum + (c - mean) ** 2, 0) / (changes.length - 1)
  return Math.sqrt(variance)
}

/** Points in the `points`-month window ending at `current`, oldest first. */
export function windowPoints(
  series: MonthlySeries,
  current: MonthKey,
  points: number,
): Array<[MonthKey, number]> {
  const first = shiftMonths(current, -(points - 1))
  return [...series.entries()]
    .filter(([month]) => month >= first && month <= current)
    .toSorted(([a], [b]) => a.localeCompare(b))
}

/** `value(now) / value(now − months) − 1`; null unless both month ends exist and the base is > 0. */
export function growthOver(
  series: MonthlySeries,
  current: MonthKey,
  months: number,
): number | null {
  const now = series.get(current)
  const then = series.get(shiftMonths(current, -months))
  if (now === undefined || then === undefined || then <= 0) return null
  return now / then - 1
}

export interface SuburbSeries {
  areaId: string
  /** The suburb's current period: `/markets/query` `period_end`. */
  periodEnd: string
  price: MonthlySeries
  rent: MonthlySeries
  yield: MonthlySeries
  /** ABS renter proportion (P1-10), when the suburb has a SAL with one. */
  renterProportion: number | null
}

export interface DerivedMetrics {
  metrics: RawMetrics
  /** Price points in the 37-month window, for the run-wide volatility rule. */
  pricePoints: number
}

/** Series → P1-8 `RawMetrics` (step 6). Fractions throughout. */
export function deriveRawMetrics(series: SuburbSeries): DerivedMetrics {
  const current = monthKey(series.periodEnd)
  return {
    metrics: {
      areaId: series.areaId,
      yieldNow: series.yield.get(current) ?? null,
      rentGrowth12m: growthOver(series.rent, current, 12),
      priceGrowth36m: growthOver(series.price, current, 36),
      renterProportion: series.renterProportion,
      priceVolatility: priceVolatility(series.price, current),
    },
    pricePoints: windowPoints(series.price, current, 37).length,
  }
}

/**
 * Run-wide rule (AC 6, decided 2026-10-09): `low_volatility` is disabled for
 * the whole run, and its weight redistributed by P1-8, when fewer than half
 * the survivors have 18+ price points. Below that, the factor would be a
 * percentile over a minority and say little. Otherwise suburbs short of 18
 * points simply lack the factor (coverage renormalises for them).
 */
export function disabledFactorsFor(pricePoints: readonly number[]): FactorId[] {
  if (pricePoints.length === 0) return []
  const enough = pricePoints.filter((n) => n >= MIN_VOLATILITY_POINTS).length
  return enough * 2 < pricePoints.length ? ["low_volatility"] : []
}
