import { z } from "zod"

/**
 * Ranking presets (P1-8; D17, D19 as amended by D68). Our own judgement,
 * defined independently of HtAG's strategy presets (D39). Thresholds follow
 * Brian's suburb-selection guideline for the single-user MVP and must be
 * recalibrated before presets ship to other tenants (D68). Recalibration bumps
 * `PRESET_VERSION`; every task records the version it ran with.
 */
export const PRESET_VERSION = "2026-10-01.v1"

export const STRATEGIES = ["growth", "cashflow", "balanced"] as const
export const strategySchema = z.enum(STRATEGIES)
export type Strategy = z.infer<typeof strategySchema>

export const RISK_TOLERANCES = ["low", "medium", "high"] as const
export const riskToleranceSchema = z.enum(RISK_TOLERANCES)
export type RiskTolerance = z.infer<typeof riskToleranceSchema>

/** Ranking factors (D68). How each is scored lives in `rank.ts` (`FACTOR_SCORING`). */
export const FACTOR_IDS = [
  "yield_now",
  "rent_growth_12m",
  "price_growth_36m",
  "renter_band",
  "low_volatility",
] as const
export const factorIdSchema = z.enum(FACTOR_IDS)
export type FactorId = z.infer<typeof factorIdSchema>

/** Tolerance for "sums to 1". Weights are stored normalised (P1-3 normalises on save). */
export const WEIGHT_SUM_TOLERANCE = 1e-6

const weightValue = z.number().finite().min(0).max(1)

/**
 * A full weight vector over every factor. Stored in `criteria_json.profile.weights`
 * (D18), so it is strict: unknown keys, missing keys, out-of-range values,
 * all-zero, and vectors that don't sum to 1 are all rejected.
 */
export const weightsSchema = z
  .strictObject({
    yield_now: weightValue,
    rent_growth_12m: weightValue,
    price_growth_36m: weightValue,
    renter_band: weightValue,
    low_volatility: weightValue,
  })
  .superRefine((weights, ctx) => {
    const sum = sumWeights(weights)
    if (sum === 0) {
      ctx.addIssue({ code: "custom", message: "At least one weight must be greater than 0" })
    } else if (Math.abs(sum - 1) > WEIGHT_SUM_TOLERANCE) {
      ctx.addIssue({
        code: "custom",
        message: `Weights must sum to 1 (got ${sum}); normalise with normaliseWeights()`,
      })
    }
  })
export type Weights = z.infer<typeof weightsSchema>

export function zeroWeights(): Weights {
  return {
    yield_now: 0,
    rent_growth_12m: 0,
    price_growth_36m: 0,
    renter_band: 0,
    low_volatility: 0,
  }
}

export function sumWeights(weights: Readonly<Record<FactorId, number>>): number {
  return FACTOR_IDS.reduce((sum, id) => sum + weights[id], 0)
}

/**
 * Scale raw slider values so they sum to 1. Throws on an all-zero or negative
 * vector — there is nothing meaningful to normalise.
 */
export function normaliseWeights(raw: Readonly<Record<FactorId, number>>): Weights {
  for (const id of FACTOR_IDS) {
    if (!Number.isFinite(raw[id]) || raw[id] < 0) {
      throw new RangeError(`Weight ${id} must be a finite number >= 0 (got ${raw[id]})`)
    }
  }
  const sum = sumWeights(raw)
  if (sum === 0) throw new RangeError("Cannot normalise an all-zero weight vector")
  const out = zeroWeights()
  for (const id of FACTOR_IDS) out[id] = raw[id] / sum
  return out
}

/**
 * Base weights per strategy, before the risk-driven `low_volatility` share
 * (D68). Growth means "not peaked, rents rising, healthy renter mix" — not
 * "fastest recent price rise".
 */
export const BASE_WEIGHTS: Readonly<Record<Strategy, Readonly<Weights>>> = {
  growth: {
    ...zeroWeights(),
    rent_growth_12m: 0.35,
    price_growth_36m: 0.3,
    renter_band: 0.2,
    yield_now: 0.15,
  },
  cashflow: {
    ...zeroWeights(),
    yield_now: 0.5,
    rent_growth_12m: 0.3,
    renter_band: 0.15,
    price_growth_36m: 0.05,
  },
  balanced: {
    ...zeroWeights(),
    yield_now: 0.3,
    rent_growth_12m: 0.3,
    price_growth_36m: 0.25,
    renter_band: 0.15,
  },
}

/** `low_volatility` weight per risk tolerance; the base vector is scaled by `1 − w`. */
export const LOW_VOLATILITY_WEIGHT: Readonly<Record<RiskTolerance, number>> = {
  low: 0.25,
  medium: 0.1,
  high: 0,
}

/** One of the 9 preset weight vectors (D17, D68). Sums to 1. */
export function presetWeights(strategy: Strategy, risk: RiskTolerance): Weights {
  const base = BASE_WEIGHTS[strategy]
  const lv = LOW_VOLATILITY_WEIGHT[risk]
  const out = zeroWeights()
  for (const id of FACTOR_IDS) out[id] = base[id] * (1 - lv)
  out.low_volatility = lv
  return out
}

/** HtAG `confidence` floor a preset applies. `"any"` emits no confidence leaf. */
export const CONFIDENCE_FLOORS = ["high", "any"] as const
export type ConfidenceFloor = (typeof CONFIDENCE_FLOORS)[number]

/**
 * Hard-filter defaults a preset prefills (D19, D43, D68). Percent values are
 * percentages as the investor types them (4.5 = 4.5%); `compileToHtagLogic`
 * (P1-3) converts them to HtAG's fractions. An absent key means "filter off".
 *
 * - `maxPriceGrowth36mPct` is cumulative growth over 36 months (50 = +50%).
 *   P1-3 compiles it to HtAG's `price_3y_cagr` (1.5^(1/3) − 1 ≈ 14.47%/yr).
 * - `minIrsadDecile`: HtAG `irsad` is a decile, 1–10 (Q16).
 */
export interface PresetFilterDefaults {
  minGrossYieldPct?: number
  maxVacancyRatePct?: number
  maxStockOnMarketPct?: number
  maxDaysOnMarket?: number
  maxPriceGrowth36mPct?: number
  minAnnualSalesVolume?: number
  minIrsadDecile?: number
  confidence: ConfidenceFloor
}

/** Strategy's contribution: a yield floor for cashflow / balanced. */
export const STRATEGY_FILTER_DEFAULTS: Readonly<
  Record<Strategy, Readonly<Pick<PresetFilterDefaults, "minGrossYieldPct">>>
> = {
  growth: {},
  cashflow: { minGrossYieldPct: 4.5 },
  balanced: { minGrossYieldPct: 3.5 },
}

/** Risk's contribution: every other floor and ceiling (D19, D68). */
export const RISK_FILTER_DEFAULTS: Readonly<
  Record<RiskTolerance, Readonly<Omit<PresetFilterDefaults, "minGrossYieldPct">>>
> = {
  low: {
    confidence: "high",
    minIrsadDecile: 5,
    maxVacancyRatePct: 1.5,
    maxStockOnMarketPct: 1.3,
    maxDaysOnMarket: 50,
    maxPriceGrowth36mPct: 50,
    minAnnualSalesVolume: 100,
  },
  medium: {
    confidence: "high",
    minIrsadDecile: 3,
    maxVacancyRatePct: 2.5,
    maxStockOnMarketPct: 1.3,
    maxDaysOnMarket: 65,
    maxPriceGrowth36mPct: 50,
    minAnnualSalesVolume: 50,
  },
  high: {
    confidence: "any",
    maxVacancyRatePct: 4,
    maxStockOnMarketPct: 2,
    maxDaysOnMarket: 90,
    minAnnualSalesVolume: 20,
  },
}

/** Filter defaults for one strategy × risk preset. Returns a fresh object. */
export function presetFilterDefaults(
  strategy: Strategy,
  risk: RiskTolerance,
): PresetFilterDefaults {
  return { ...RISK_FILTER_DEFAULTS[risk], ...STRATEGY_FILTER_DEFAULTS[strategy] }
}
