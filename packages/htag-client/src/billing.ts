import {
  audDecimalSchema,
  htagBillingTierSchema,
  type HtagBillingTier,
  type HtagCostSource,
  type HtagTier,
} from "@my-ba/shared"
import type { HtagLogger } from "./logger"

/** HtAG's per-request billing telemetry. Present only on 2xx responses to billable endpoints. */
export interface HtagBillingHeaders {
  /** `X-Billing-Cost`, AUD. */
  cost: string | null
  /** `X-Billing-Units`. */
  units: number | null
  /** `X-Billing-Balance`, AUD after this request. */
  balance: string | null
  /** `X-Billing-Tier`: the volume band, not the endpoint's value tier. */
  tier: HtagBillingTier | null
  /** `X-Billing-Free-Remaining`: free units left on this endpoint's allowance. */
  freeRemaining: number | null
}

const decimal = (value: string | null) =>
  value !== null && audDecimalSchema.safeParse(value).success ? value : null

const integer = (value: string | null) => {
  if (value === null || !/^\d+$/.test(value)) return null
  return Number(value)
}

export function parseBillingHeaders(headers: Headers, logger: HtagLogger): HtagBillingHeaders {
  const rawTier = headers.get("x-billing-tier")
  const tier = rawTier === null ? null : htagBillingTierSchema.safeParse(rawTier)
  if (tier && !tier.success) {
    logger.warn("Unknown X-Billing-Tier value; recording null", { value: rawTier })
  }
  return {
    cost: decimal(headers.get("x-billing-cost")),
    units: integer(headers.get("x-billing-units")),
    balance: decimal(headers.get("x-billing-balance")),
    tier: tier?.success ? tier.data : null,
    freeRemaining: integer(headers.get("x-billing-free-remaining")),
  }
}

export interface HtagCost {
  costAud: string
  costSource: HtagCostSource
}

/**
 * Cost of record (D62): HtAG's own `X-Billing-Cost` on a 2xx. Non-2xx and
 * network errors are not charged. A 2xx without the header falls back to
 * rows × the configured rate for the endpoint's value tier, flagged as an
 * estimate. The estimate ignores the free allowance, so it errs high.
 */
export function costOfRecord(input: {
  status: number | null
  billing: HtagBillingHeaders | null
  rowsReturned: number
  tier: HtagTier
  rates: Partial<Record<HtagTier, number>>
  endpoint: string
  logger: HtagLogger
}): HtagCost {
  const { status, billing, rowsReturned, tier, rates, endpoint, logger } = input
  if (status === null || status < 200 || status >= 300) return { costAud: "0", costSource: "none" }
  if (billing?.cost != null) return { costAud: billing.cost, costSource: "header" }

  const rate = rates[tier]
  if (rate === undefined) {
    logger.error("2xx without X-Billing-Cost and no configured rate for tier; cost unknown", {
      endpoint,
      tier,
    })
    return { costAud: "0", costSource: "none" }
  }
  logger.warn("2xx without X-Billing-Cost; recording a config estimate", { endpoint, tier })
  return { costAud: (rowsReturned * rate).toFixed(4), costSource: "config_estimate" }
}
