import { type Criteria, criteriaShapeSchema } from "@my-ba/shared"

import {
  type HtagLogicLeaf,
  type HtagLogicNode,
  type MarketQueryInput,
  htagLogicNodeSchema,
  marketQueryInputSchema,
} from "./schemas"

/**
 * Criteria → HtAG `logic` (P1-3, D42, D43, D68). Pure: no I/O, no config.
 *
 * Percent inputs become fractions here and nowhere else (HtAG rates are
 * fractions, Q16). Cumulative 36-month growth becomes a 3-year CAGR, the unit
 * of HtAG's `price_3y_cagr` (D68; accepted in `logic`, Q16).
 *
 * Accepts any structurally complete criteria (`criteriaShapeSchema`), including
 * one with every filter off — the Run-only "at least three filters" rule is the
 * form's and the API's, not the compiler's.
 *
 * Leaf order is fixed (bedrooms, state, confidence, then filters in schema
 * order), so the same criteria always compile to the same body — snapshots and
 * the `analysis_steps` request record stay diffable.
 */
export function compileToHtagLogic(input: Criteria): HtagLogicNode {
  const criteria = criteriaShapeSchema.parse(input)
  const f = criteria.filters
  const leaves: HtagLogicLeaf[] = [
    { field: "bedrooms", eq: criteria.bedrooms },
    { field: "state", in: [...criteria.states] },
  ]

  if (f.highConfidenceOnly) leaves.push({ field: "confidence", eq: "High" })
  if (f.typicalPrice) leaves.push(range("typical_price", f.typicalPrice))
  if (f.grossYieldPct) {
    leaves.push(
      range("gross_yield", {
        min: percentToFraction(f.grossYieldPct.min),
        max: percentToFraction(f.grossYieldPct.max),
      }),
    )
  }
  if (f.maxVacancyRatePct !== undefined) {
    leaves.push({ field: "vacancy_rate", lte: percentToFraction(f.maxVacancyRatePct) })
  }
  if (f.maxStockOnMarketPct !== undefined) {
    leaves.push({ field: "som_percent", lte: percentToFraction(f.maxStockOnMarketPct) })
  }
  if (f.maxDaysOnMarket !== undefined) leaves.push({ field: "dom", lte: f.maxDaysOnMarket })
  if (f.maxPriceGrowth36mPct !== undefined) {
    leaves.push({ field: "price_3y_cagr", lte: cumulativePctToCagr(f.maxPriceGrowth36mPct, 3) })
  }
  if (f.minAnnualSalesVolume !== undefined) {
    leaves.push({ field: "annual_sales_volume", gte: f.minAnnualSalesVolume })
  }
  if (f.minIrsadDecile !== undefined) leaves.push({ field: "irsad", gte: f.minIrsadDecile })

  return htagLogicNodeSchema.parse({ and: leaves })
}

/** The full `POST /markets/query` body for a screening run (P1-4 step 1). */
export function compileScreeningQuery(
  criteria: Criteria,
  options: { limit: number },
): MarketQueryInput {
  return marketQueryInputSchema.parse({
    level: "suburb",
    property_types: [criteriaShapeSchema.parse(criteria).propertyType],
    logic: compileToHtagLogic(criteria),
    limit: options.limit,
  })
}

/** Rounded to 6 dp so `1.3 / 100` is `0.013`, not `0.013000000000000001`. */
const round6 = (value: number) => Math.round(value * 1e6) / 1e6

export function percentToFraction(pct: number): number
export function percentToFraction(pct: number | undefined): number | undefined
export function percentToFraction(pct: number | undefined): number | undefined {
  return pct === undefined ? undefined : round6(pct / 100)
}

/** `(1 + pct/100)^(1/years) − 1`, as a fraction: 50% over 3 years → 0.144714. */
export function cumulativePctToCagr(pct: number, years: number): number {
  return round6(Math.pow(1 + pct / 100, 1 / years) - 1)
}

function range(field: string, r: { min?: number | undefined; max?: number | undefined }) {
  const leaf: HtagLogicLeaf = { field }
  if (r.min !== undefined) leaf.gte = r.min
  if (r.max !== undefined) leaf.lte = r.max
  return leaf
}
