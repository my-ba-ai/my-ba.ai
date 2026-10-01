import { z } from "zod"

import { FACTOR_IDS, type FactorId, type Weights, factorIdSchema, weightsSchema } from "./presets"

/**
 * Per-suburb ranking inputs (D44, D68). Factor-level values only: P1-4 derives
 * them from HtAG Reference-tier price / rent / yield history and ABS tenure
 * (P1-10). No HtAG proprietary scores (RCS, Dex, GRC, …) — D39. Strict, so a
 * proprietary field added upstream is rejected at this boundary rather than
 * silently ranked.
 *
 * A missing (`undefined`/`null`) value means "not available for this suburb";
 * it lowers coverage but is never treated as zero.
 */
const metricValue = z.number().finite().nullish()

export const rawMetricsSchema = z.strictObject({
  /** HtAG `area_id` (`loc_pid`). Also the deterministic tie-break. */
  areaId: z.string().min(1),
  /** Current gross yield, as a fraction (HtAG `yield_val` / `gross_yield`). */
  yieldNow: metricValue,
  /** Rent change over the last 12 months, as a fraction (0.05 = +5%). */
  rentGrowth12m: metricValue,
  /** Cumulative price change over the last 36 months, as a fraction (0.5 = +50%). */
  priceGrowth36m: metricValue,
  /** ABS renter proportion, 0–1 (P1-10). */
  renterProportion: z.number().finite().min(0).max(1).nullish(),
  /** Price volatility (P1-4 defines the statistic). Lower is better. */
  priceVolatility: z.number().finite().min(0).nullish(),
})
export type RawMetrics = z.infer<typeof rawMetricsSchema>

/** Coverage strictly below this ⇒ `insufficientData` (D44). */
export const INSUFFICIENT_COVERAGE_THRESHOLD = 0.5

/**
 * Targets for the absolute-scored factors (D68). Fractions.
 * - `renter_band`: 1 inside [min, max], falling linearly to 0 at `falloff`
 *   beyond either edge (so 0 at 0% and at 50% renters).
 * - `price_growth_36m`: 1 up to `comfort`, falling linearly to 0 at `ceiling`;
 *   0 above it. Marks suburbs down as they approach the peak without rewarding
 *   the fastest risers.
 */
export const RANKING_TARGETS = {
  renterBand: { min: 0.15, max: 0.35, falloff: 0.15 },
  priceGrowth36m: { comfort: 0.35, ceiling: 0.5 },
} as const

export const SCORING_METHODS = ["percentile", "band", "ceiling"] as const
export type ScoringMethod = (typeof SCORING_METHODS)[number]

type FactorScoring =
  | { method: "percentile"; read: (m: RawMetrics) => number | undefined; higherIsBetter: boolean }
  | {
      method: "band" | "ceiling"
      read: (m: RawMetrics) => number | undefined
      score: (raw: number) => number
    }

/**
 * How each factor reads its raw value and turns it into a 0–1 factor score.
 * Percentile factors are relative to the survivor set; band and ceiling
 * factors are absolute, so they mean the same thing in every task.
 */
export const FACTOR_SCORING: Readonly<Record<FactorId, FactorScoring>> = {
  yield_now: { method: "percentile", read: (m) => m.yieldNow ?? undefined, higherIsBetter: true },
  rent_growth_12m: {
    method: "percentile",
    read: (m) => m.rentGrowth12m ?? undefined,
    higherIsBetter: true,
  },
  price_growth_36m: {
    method: "ceiling",
    read: (m) => m.priceGrowth36m ?? undefined,
    score: (raw) => ceilingScore(raw, RANKING_TARGETS.priceGrowth36m),
  },
  renter_band: {
    method: "band",
    read: (m) => m.renterProportion ?? undefined,
    score: (raw) => bandScore(raw, RANKING_TARGETS.renterBand),
  },
  low_volatility: {
    method: "percentile",
    read: (m) => m.priceVolatility ?? undefined,
    higherIsBetter: false,
  },
}

/** 1 inside [min, max]; linear to 0 at `falloff` outside either edge. */
export function bandScore(
  raw: number,
  band: { min: number; max: number; falloff: number },
): number {
  const distance = raw < band.min ? band.min - raw : raw > band.max ? raw - band.max : 0
  return Math.max(0, 1 - distance / band.falloff)
}

/** 1 up to `comfort`; linear to 0 at `ceiling`; 0 beyond. */
export function ceilingScore(raw: number, target: { comfort: number; ceiling: number }): number {
  if (raw <= target.comfort) return 1
  if (raw >= target.ceiling) return 0
  return (target.ceiling - raw) / (target.ceiling - target.comfort)
}

/**
 * Percentile rank of each defined value within the defined set, in [0, 1].
 * Ties take their average rank; a single defined value is 0.5; `undefined`
 * stays `undefined`. Position-preserving.
 */
export function percentileRanks(
  values: ReadonlyArray<number | undefined>,
): Array<number | undefined> {
  const defined = values
    .map((value, index) => ({ value, index }))
    .filter((entry): entry is { value: number; index: number } => entry.value !== undefined)
    .sort((a, b) => a.value - b.value)

  const out: Array<number | undefined> = values.map(() => undefined)
  const n = defined.length
  if (n === 0) return out
  if (n === 1) {
    out[defined[0]!.index] = 0.5
    return out
  }

  let start = 0
  while (start < n) {
    let end = start
    while (end + 1 < n && defined[end + 1]!.value === defined[start]!.value) end++
    // 0-based positions start..end share the average position.
    const percentile = (start + end) / 2 / (n - 1)
    for (let i = start; i <= end; i++) out[defined[i]!.index] = percentile
    start = end + 1
  }
  return out
}

export const FACTOR_STATUSES = ["used", "missing", "disabled", "zero_weight"] as const
export type FactorStatus = (typeof FACTOR_STATUSES)[number]

export interface FactorBreakdown {
  method: ScoringMethod
  /** Raw value as read from `RawMetrics`. `null` when missing. */
  raw: number | null
  /**
   * Factor score in [0, 1], 1 = best: an oriented percentile for `percentile`
   * factors, the band / ceiling curve otherwise. `null` when missing or not scored.
   */
  factorScore: number | null
  /** Effective weight after removing disabled / zero factors and renormalising. */
  weight: number
  /** Share of `score` from this factor; contributions of a suburb sum to its score. */
  contribution: number
  status: FactorStatus
}

/**
 * One ranked suburb. Stored as `screening_results.score_breakdown_json` (P1-4).
 * Percentile factors are relative to the task's survivor set, so raw values
 * are kept (D44).
 */
export interface Ranked {
  areaId: string
  /** 1-based position in the returned order. */
  rank: number
  /** Weighted mean of available factor scores, 0–1. `null` when no factor is available. */
  score: number | null
  /** Sum of effective weights of available factors, 0–1. */
  coverage: number
  insufficientData: boolean
  breakdown: Record<FactorId, FactorBreakdown>
}

export interface RankOptions {
  /** Factors switched off for this run (e.g. `low_volatility` with < 18 price points, P1-4). */
  disabledFactors?: ReadonlyArray<FactorId>
}

/**
 * Rank a survivor set (D44, D68). Pure and deterministic: score each enabled
 * factor (percentile within the set, or an absolute band / ceiling curve),
 * take the weighted mean over the factors each suburb has, flag coverage < 50%
 * as `insufficientData` and sort it last, and break ties on `areaId`.
 *
 * Disabled factors are removed before renormalising, so they never count
 * against coverage. Throws on invalid weights, invalid or duplicate metrics,
 * or when every weighted factor is disabled.
 */
export function rankSuburbs(
  metrics: ReadonlyArray<RawMetrics>,
  weights: Weights,
  options: RankOptions = {},
): Ranked[] {
  const parsedWeights = weightsSchema.parse(weights)
  const parsedMetrics = z.array(rawMetricsSchema).parse(metrics)
  const disabled = new Set(z.array(factorIdSchema).parse(options.disabledFactors ?? []))

  const seen = new Set<string>()
  for (const m of parsedMetrics) {
    if (seen.has(m.areaId)) throw new RangeError(`Duplicate areaId in metrics: ${m.areaId}`)
    seen.add(m.areaId)
  }

  const enabled = FACTOR_IDS.filter((id) => parsedWeights[id] > 0 && !disabled.has(id))
  const enabledSum = enabled.reduce((sum, id) => sum + parsedWeights[id], 0)
  if (enabled.length === 0 || enabledSum === 0) {
    throw new RangeError("Every weighted factor is disabled; nothing to rank on")
  }
  const effective = new Map<FactorId, number>(
    enabled.map((id) => [id, parsedWeights[id] / enabledSum]),
  )

  const rawByFactor = new Map<FactorId, Array<number | undefined>>()
  const scoreByFactor = new Map<FactorId, Array<number | undefined>>()
  for (const id of FACTOR_IDS) {
    const scoring = FACTOR_SCORING[id]
    const raws = parsedMetrics.map(scoring.read)
    rawByFactor.set(id, raws)
    if (!effective.has(id)) continue
    if (scoring.method === "percentile") {
      const ranks = percentileRanks(raws)
      scoreByFactor.set(
        id,
        scoring.higherIsBetter ? ranks : ranks.map((p) => (p === undefined ? undefined : 1 - p)),
      )
    } else {
      scoreByFactor.set(
        id,
        raws.map((raw) => (raw === undefined ? undefined : scoring.score(raw))),
      )
    }
  }

  const unsorted = parsedMetrics.map((m, i) => {
    let coverage = 0
    let weighted = 0
    for (const [id, w] of effective) {
      const s = scoreByFactor.get(id)![i]
      if (s !== undefined) {
        coverage += w
        weighted += w * s
      }
    }
    const score = coverage > 0 ? weighted / coverage : null

    const breakdown = {} as Record<FactorId, FactorBreakdown>
    for (const id of FACTOR_IDS) {
      const method = FACTOR_SCORING[id].method
      const raw = rawByFactor.get(id)![i] ?? null
      const w = effective.get(id)
      const s = scoreByFactor.get(id)?.[i]
      if (w === undefined) {
        breakdown[id] = {
          method,
          raw,
          factorScore: null,
          weight: 0,
          contribution: 0,
          status: disabled.has(id) && parsedWeights[id] > 0 ? "disabled" : "zero_weight",
        }
      } else if (s === undefined) {
        breakdown[id] = {
          method,
          raw,
          factorScore: null,
          weight: w,
          contribution: 0,
          status: "missing",
        }
      } else {
        breakdown[id] = {
          method,
          raw,
          factorScore: s,
          weight: w,
          contribution: (w * s) / coverage,
          status: "used",
        }
      }
    }

    return {
      areaId: m.areaId,
      score,
      coverage,
      insufficientData: coverage < INSUFFICIENT_COVERAGE_THRESHOLD,
      breakdown,
    }
  })

  unsorted.sort((a, b) => {
    if (a.insufficientData !== b.insufficientData) return a.insufficientData ? 1 : -1
    if (a.score !== b.score) {
      if (a.score === null) return 1
      if (b.score === null) return -1
      return b.score - a.score
    }
    // Code-unit comparison, not localeCompare: identical on every machine.
    return a.areaId < b.areaId ? -1 : a.areaId > b.areaId ? 1 : 0
  })

  return unsorted.map((entry, index) => ({ ...entry, rank: index + 1 }))
}
