import type { HtagTier } from "@my-ba/shared"

/** Trend series the client exposes: `GET /markets/trends/{metric}`. */
export const HTAG_TREND_METRICS = [
  "price",
  "rent",
  "yield",
  "stock-on-market",
  "days-on-market",
  "vacancy",
] as const
export type HtagTrendMetric = (typeof HTAG_TREND_METRICS)[number]

/** Only these trends accept `bedrooms`; the spec has none on SOM, DOM or vacancy. */
export const HTAG_BEDROOM_TREND_METRICS = ["price", "rent", "yield"] as const
export type HtagBedroomTrendMetric = (typeof HTAG_BEDROOM_TREND_METRICS)[number]

export const HTAG_QUERY_PATH = "/markets/query"
export const HTAG_SUMMARY_PATH = "/markets/summary"
export const trendPath = (metric: HtagTrendMetric) => `/markets/trends/${metric}`
/** ABS SAL code → HtAG `loc_pid` (P1-10, D72). One code per call; returns a bare object, not `{ results }`. */
export const HTAG_SAL_TO_LOCALITY_PATH = "/reference/concordance/sal-to-locality"

/**
 * Each endpoint's value tier, from the spec's `x-htg-pricingTier` (D61).
 * `endpoints.spec.ts` asserts this table against docs/htag/openapi.json, so a
 * re-download that reprices an endpoint fails the build rather than the ledger.
 */
export const HTAG_ENDPOINT_TIERS: Readonly<Record<string, HtagTier>> = {
  [HTAG_QUERY_PATH]: "premium",
  [HTAG_SUMMARY_PATH]: "standard",
  [trendPath("price")]: "reference",
  [trendPath("rent")]: "reference",
  [trendPath("yield")]: "reference",
  [trendPath("stock-on-market")]: "restricted",
  [trendPath("days-on-market")]: "restricted",
  [trendPath("vacancy")]: "restricted",
  [HTAG_SAL_TO_LOCALITY_PATH]: "reference",
}

export function tierFor(path: string): HtagTier {
  const tier = HTAG_ENDPOINT_TIERS[path]
  if (!tier) throw new Error(`No value tier configured for HtAG endpoint ${path}`)
  return tier
}
