import { describe, expect, it } from "vitest"

import { normaliseWeights, presetWeights, zeroWeights } from "./presets"
import {
  type RawMetrics,
  bandScore,
  ceilingScore,
  percentileRanks,
  RANKING_TARGETS,
  rankSuburbs,
  rankedListSchema,
  rankedSchema,
  rawMetricsSchema,
} from "./rank"

const full = (areaId: string, v: number): RawMetrics => ({
  areaId,
  yieldNow: v,
  rentGrowth12m: v,
  priceGrowth36m: v / 10,
  renterProportion: v / 10,
  priceVolatility: v,
})

describe("percentileRanks (AC 2)", () => {
  it("spreads distinct values over [0, 1]", () => {
    expect(percentileRanks([30, 10, 20])).toEqual([1, 0, 0.5])
  })

  it("gives ties their average rank", () => {
    // sorted positions 0,1,2,3 → the two 2s share (1+2)/2 = 1.5 → 1.5/3 = 0.5
    expect(percentileRanks([1, 2, 2, 3])).toEqual([0, 0.5, 0.5, 1])
    expect(percentileRanks([5, 5, 5])).toEqual([0.5, 0.5, 0.5])
  })

  it("returns 0.5 for a single defined value", () => {
    expect(percentileRanks([7])).toEqual([0.5])
    expect(percentileRanks([undefined, 7, undefined])).toEqual([undefined, 0.5, undefined])
  })

  it("leaves undefined in place and ranks only defined values", () => {
    expect(percentileRanks([undefined, 3, 1])).toEqual([undefined, 1, 0])
  })

  it("handles all-undefined and empty", () => {
    expect(percentileRanks([undefined, undefined])).toEqual([undefined, undefined])
    expect(percentileRanks([])).toEqual([])
  })
})

describe("rankSuburbs", () => {
  const yieldOnly = normaliseWeights({ ...zeroWeights(), yield_now: 1 })

  it("orders by score, best first, and numbers ranks from 1", () => {
    const ranked = rankSuburbs([full("A", 1), full("B", 3), full("C", 2)], yieldOnly)
    expect(ranked.map((r) => [r.areaId, r.rank, r.score])).toEqual([
      ["B", 1, 1],
      ["C", 2, 0.5],
      ["A", 3, 0],
    ])
  })

  it("treats low_volatility as lower-is-better", () => {
    const w = normaliseWeights({ ...zeroWeights(), low_volatility: 1 })
    const ranked = rankSuburbs([full("A", 0.3), full("B", 0.1)], w)
    expect(ranked[0]!.areaId).toBe("B")
    expect(ranked[0]!.breakdown.low_volatility.raw).toBe(0.1)
    expect(ranked[0]!.breakdown.low_volatility.factorScore).toBe(1)
  })

  it("scores renter proportion on the 15–35% band, not monotonically", () => {
    const w = normaliseWeights({ ...zeroWeights(), renter_band: 1 })
    const ranked = rankSuburbs(
      [
        { areaId: "HIGH", renterProportion: 0.55 },
        { areaId: "MID", renterProportion: 0.25 },
        { areaId: "LOW", renterProportion: 0.1 },
      ],
      w,
    )
    expect(ranked.map((r) => [r.areaId, r.score])).toEqual([
      ["MID", 1],
      ["LOW", expect.closeTo(2 / 3, 12)],
      ["HIGH", 0],
    ])
    expect(ranked[0]!.breakdown.renter_band).toMatchObject({ method: "band", raw: 0.25 })
  })

  it("scores 36-month growth on the comfort/ceiling curve, not by momentum", () => {
    const w = normaliseWeights({ ...zeroWeights(), price_growth_36m: 1 })
    const ranked = rankSuburbs(
      [
        { areaId: "HOT", priceGrowth36m: 0.48 },
        { areaId: "WARM", priceGrowth36m: 0.425 },
        { areaId: "COOL", priceGrowth36m: 0.1 },
      ],
      w,
    )
    expect(ranked.map((r) => [r.areaId, r.score])).toEqual([
      ["COOL", 1],
      ["WARM", expect.closeTo(0.5, 12)],
      ["HOT", expect.closeTo(2 / 15, 12)],
    ])
  })

  it("keeps absolute factor scores independent of the survivor set", () => {
    const w = normaliseWeights({ ...zeroWeights(), renter_band: 1 })
    const [alone] = rankSuburbs([{ areaId: "A", renterProportion: 0.4 }], w)
    expect(alone!.breakdown.renter_band.factorScore).toBeCloseTo(2 / 3, 12)
  })

  it("contributions sum to score and weights are reported effective", () => {
    const weights = presetWeights("balanced", "medium")
    const ranked = rankSuburbs([full("A", 1), full("B", 2), full("C", 3)], weights)
    for (const r of ranked) {
      const total = Object.values(r.breakdown).reduce((s, f) => s + f.contribution, 0)
      expect(total).toBeCloseTo(r.score!, 12)
      expect(r.coverage).toBeCloseTo(1, 12)
    }
    expect(ranked[0]!.breakdown.low_volatility.status).toBe("used")
    const zero = rankSuburbs([full("A", 1)], normaliseWeights({ ...zeroWeights(), yield_now: 1 }))
    expect(zero[0]!.breakdown.renter_band.status).toBe("zero_weight")
  })

  describe("disabled factors (AC 3)", () => {
    const weights = presetWeights("growth", "low") // low_volatility 0.25

    it("renormalises remaining weights and does not penalise coverage", () => {
      const metrics = [full("A", 1), full("B", 2)].map(({ priceVolatility: _v, ...m }) => m)
      const ranked = rankSuburbs(metrics, weights, { disabledFactors: ["low_volatility"] })
      for (const r of ranked) {
        expect(r.coverage).toBeCloseTo(1, 12)
        expect(r.insufficientData).toBe(false)
        expect(r.breakdown.low_volatility).toMatchObject({ status: "disabled", weight: 0 })
        expect(r.breakdown.rent_growth_12m.weight).toBeCloseTo(0.35, 12)
      }
    })

    it("counts a missing (not disabled) factor against coverage", () => {
      const metrics = [full("A", 1), full("B", 2)].map(({ priceVolatility: _v, ...m }) => m)
      const ranked = rankSuburbs(metrics, weights)
      expect(ranked[0]!.coverage).toBeCloseTo(0.75, 12)
      expect(ranked[0]!.breakdown.low_volatility.status).toBe("missing")
    })

    it("throws when every weighted factor is disabled", () => {
      const w = normaliseWeights({ ...zeroWeights(), low_volatility: 1 })
      expect(() => rankSuburbs([full("A", 1)], w, { disabledFactors: ["low_volatility"] })).toThrow(
        RangeError,
      )
    })
  })

  describe("insufficient data (AC 4)", () => {
    const weights = normaliseWeights({ ...zeroWeights(), yield_now: 0.6, rent_growth_12m: 0.4 })

    it("flags coverage < 50% and sorts it below every sufficient suburb", () => {
      const ranked = rankSuburbs(
        [
          { areaId: "THIN", rentGrowth12m: 99 }, // coverage 0.4, best rent growth
          { areaId: "LOW", yieldNow: 0.01, rentGrowth12m: 0 },
          { areaId: "MID", yieldNow: 0.02, rentGrowth12m: 0 },
          { areaId: "NONE" }, // coverage 0, score null
        ],
        weights,
      )
      expect(ranked.map((r) => r.areaId)).toEqual(["MID", "LOW", "THIN", "NONE"])
      expect(ranked[2]).toMatchObject({ insufficientData: true, score: 1 })
      expect(ranked[3]).toMatchObject({ insufficientData: true, score: null, coverage: 0 })
    })

    it("treats exactly 50% coverage as sufficient", () => {
      const half = normaliseWeights({ ...zeroWeights(), yield_now: 1, rent_growth_12m: 1 })
      const [r] = rankSuburbs([{ areaId: "A", yieldNow: 0.03 }], half)
      expect(r).toMatchObject({ coverage: 0.5, insufficientData: false })
    })
  })

  describe("determinism (AC 5)", () => {
    it("breaks score ties on areaId by code unit, not locale", () => {
      const ranked = rankSuburbs(
        [full("b", 1), full("B", 1), full("a", 1), full("A", 1)],
        yieldOnly,
      )
      expect(ranked.map((r) => r.areaId)).toEqual(["A", "B", "a", "b"])
    })

    it("is stable across runs and input orderings", () => {
      const weights = presetWeights("cashflow", "medium")
      const metrics = Array.from({ length: 25 }, (_, i) => ({
        ...full(`SUB${String(i).padStart(3, "0")}`, (i * 7) % 5),
        rentGrowth12m: i % 3 === 0 ? undefined : (i * 11) % 4,
      }))
      const first = rankSuburbs(metrics, weights)
      const reversed = rankSuburbs([...metrics].toReversed(), weights)
      expect(reversed).toEqual(first)
      expect(rankSuburbs(metrics, weights)).toEqual(first)
    })
  })

  it("rejects invalid weights, invalid metrics and duplicate areaIds", () => {
    const valid = presetWeights("balanced", "low")
    expect(() => rankSuburbs([full("A", 1)], zeroWeights())).toThrow()
    expect(() => rankSuburbs([{ areaId: "" }], valid)).toThrow()
    expect(() => rankSuburbs([{ areaId: "A", renterProportion: 1.5 }], valid)).toThrow()
    expect(() => rankSuburbs([full("A", 1), full("A", 2)], valid)).toThrow(/Duplicate areaId/)
  })

  it("returns an empty list for an empty survivor set", () => {
    expect(rankSuburbs([], presetWeights("growth", "medium"))).toEqual([])
  })
})

describe("bandScore / ceilingScore (D68)", () => {
  const band = RANKING_TARGETS.renterBand
  const ceiling = RANKING_TARGETS.priceGrowth36m

  it("band: 1 inside, linear fall-off, 0 at the fall-off distance", () => {
    expect(bandScore(0.15, band)).toBe(1)
    expect(bandScore(0.35, band)).toBe(1)
    expect(bandScore(0.075, band)).toBeCloseTo(0.5, 12)
    expect(bandScore(0, band)).toBe(0)
    expect(bandScore(0.5, band)).toBeCloseTo(0, 12)
    expect(bandScore(0.9, band)).toBe(0)
  })

  it("ceiling: 1 to comfort, linear to 0 at the ceiling, 0 beyond", () => {
    expect(ceilingScore(-0.2, ceiling)).toBe(1)
    expect(ceilingScore(0.35, ceiling)).toBe(1)
    expect(ceilingScore(0.425, ceiling)).toBeCloseTo(0.5, 12)
    expect(ceilingScore(0.5, ceiling)).toBe(0)
    expect(ceilingScore(0.8, ceiling)).toBe(0)
  })
})

describe("outbound schemas (AGENTS.md: Zod at every boundary)", () => {
  const weights = presetWeights("balanced", "low")
  const ranked = rankSuburbs(
    [full("A", 1), full("B", 2), { areaId: "C", yieldNow: 0.03 }, { areaId: "D" }],
    weights,
    { disabledFactors: ["low_volatility"] },
  )
  const sample = ranked[0]!

  it("rankSuburbs output round-trips through rankedListSchema unchanged", () => {
    expect(rankedListSchema.parse(ranked)).toEqual(ranked)
    expect(new Set(ranked.flatMap((r) => Object.values(r.breakdown).map((f) => f.status)))).toEqual(
      new Set(["used", "missing", "disabled"]),
    )
  })

  it("rejects a breakdown missing a factor or carrying an unknown one", () => {
    const { renter_band: _drop, ...missing } = sample.breakdown
    expect(rankedSchema.safeParse({ ...sample, breakdown: missing }).success).toBe(false)
    const extra = { ...sample.breakdown, rcs_overall: sample.breakdown.yield_now }
    expect(rankedSchema.safeParse({ ...sample, breakdown: extra }).success).toBe(false)
  })

  it("rejects unknown top-level keys and out-of-range numbers", () => {
    expect(rankedSchema.safeParse({ ...sample, dex: 1 }).success).toBe(false)
    expect(rankedSchema.safeParse({ ...sample, coverage: 1.5 }).success).toBe(false)
    expect(rankedSchema.safeParse({ ...sample, rank: 0 }).success).toBe(false)
  })

  it("rejects a breakdown whose status and numbers disagree", () => {
    const used = sample.breakdown.yield_now
    const bad = [
      { ...used, factorScore: null },
      { ...used, status: "missing" },
      { ...used, status: "disabled" },
      { ...used, contribution: used.contribution + 0.1 },
    ]
    for (const yieldNow of bad) {
      const result = rankedSchema.safeParse({
        ...sample,
        breakdown: { ...sample.breakdown, yield_now: yieldNow },
      })
      expect(result.success).toBe(false)
    }
  })

  it("rejects insufficientData, score or coverage that disagree", () => {
    expect(rankedSchema.safeParse({ ...sample, insufficientData: true }).success).toBe(false)
    expect(rankedSchema.safeParse({ ...sample, score: null }).success).toBe(false)
    expect(rankedSchema.safeParse({ ...sample, coverage: sample.coverage - 0.1 }).success).toBe(
      false,
    )
  })

  it("rejects ranks that are not 1..n in order", () => {
    const swapped = [{ ...ranked[1]!, rank: 1 }, { ...ranked[0]!, rank: 1 }, ...ranked.slice(2)]
    expect(rankedListSchema.safeParse(swapped).success).toBe(false)
  })
})

describe("RawMetrics excludes HtAG proprietary scores (AC 7, D39)", () => {
  const PROPRIETARY = /rcs|dex|grc|htag.*score|_score$|^score/i

  it("declares no proprietary field", () => {
    const keys = Object.keys(rawMetricsSchema.shape)
    expect(keys.filter((k) => PROPRIETARY.test(k))).toEqual([])
  })

  it("rejects a proprietary field at the boundary (strict)", () => {
    for (const extra of ["rcs_overall", "dex", "grc", "rcsOverall"]) {
      expect(rawMetricsSchema.safeParse({ areaId: "A", [extra]: 0.9 }).success).toBe(false)
    }
  })
})
