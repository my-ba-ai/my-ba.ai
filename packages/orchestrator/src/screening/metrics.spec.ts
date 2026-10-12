import { describe, expect, it } from "vitest"
import {
  deriveRawMetrics,
  disabledFactorsFor,
  growthOver,
  MIN_VOLATILITY_POINTS,
  priceVolatility,
} from "./metrics"
import { dayAfter, monthsBetween, shiftMonths, windowStart } from "./periods"

const series = (values: Array<[string, number]>) => new Map(values)

/** `n` consecutive months ending 2026-08, values from `f(k)` with k = months back. */
const monthly = (n: number, f: (k: number) => number) =>
  new Map(Array.from({ length: n }, (_, k) => [shiftMonths("2026-08", -k), f(k)] as const))

describe("periods", () => {
  it("windowStart gives the first day of the first month of an n-point window (D68)", () => {
    expect(windowStart("2026-08-31", 37)).toBe("2023-08-01")
    expect(windowStart("2026-08-31", 13)).toBe("2025-08-01")
    expect(windowStart("2026-08-31", 1)).toBe("2026-08-01")
  })

  it("shifts across year boundaries", () => {
    expect(shiftMonths("2026-01", -1)).toBe("2025-12")
    expect(shiftMonths("2025-12", 1)).toBe("2026-01")
    expect(monthsBetween("2023-08", "2026-08")).toBe(36)
    expect(dayAfter("2026-02-28")).toBe("2026-03-01")
  })
})

describe("growthOver", () => {
  it("is end over base minus one, as a fraction", () => {
    const s = series([
      ["2023-08", 500_000],
      ["2026-08", 650_000],
    ])
    expect(growthOver(s, "2026-08", 36)).toBeCloseTo(0.3, 12)
  })

  it("is null when either end is missing or the base is not positive", () => {
    expect(growthOver(series([["2026-08", 1]]), "2026-08", 36)).toBeNull()
    expect(
      growthOver(
        series([
          ["2025-08", 0],
          ["2026-08", 1],
        ]),
        "2026-08",
        12,
      ),
    ).toBeNull()
  })
})

describe("priceVolatility", () => {
  it("is 0 for a constant growth rate", () => {
    const s = monthly(37, (k) => 100 * 1.01 ** -k)
    expect(priceVolatility(s, "2026-08")).toBeCloseTo(0, 12)
  })

  it("is the sample stdev of month-over-month changes", () => {
    // Alternating +10% / −10%-ish changes: values 100, 110, 100, 110, …
    const s = monthly(20, (k) => (k % 2 === 0 ? 110 : 100))
    const changes = Array.from({ length: 19 }, (_, i) => (i % 2 === 0 ? 0.1 : 100 / 110 - 1))
    const mean = changes.reduce((a, b) => a + b, 0) / changes.length
    const sd = Math.sqrt(changes.reduce((a, c) => a + (c - mean) ** 2, 0) / (changes.length - 1))
    expect(priceVolatility(s, "2026-08")).toBeCloseTo(sd, 12)
  })

  it(`is null below ${MIN_VOLATILITY_POINTS} points in the window`, () => {
    expect(
      priceVolatility(
        monthly(MIN_VOLATILITY_POINTS - 1, () => 100),
        "2026-08",
      ),
    ).toBeNull()
    expect(
      priceVolatility(
        monthly(MIN_VOLATILITY_POINTS, () => 100),
        "2026-08",
      ),
    ).toBe(0)
  })

  it("ignores points outside the 37-month window and skips gaps", () => {
    const s = monthly(60, (k) => (k > 36 ? 1 : 100))
    expect(priceVolatility(s, "2026-08")).toBe(0)
    const gappy = monthly(30, () => 100)
    gappy.delete(shiftMonths("2026-08", -5))
    gappy.set(shiftMonths("2026-08", -4), 200) // one jump, then its own month pair
    expect(priceVolatility(gappy, "2026-08")).toBeGreaterThan(0)
  })
})

describe("deriveRawMetrics", () => {
  it("reads yield at the current month and counts price points", () => {
    const derived = deriveRawMetrics({
      areaId: "NSW1",
      periodEnd: "2026-08-31",
      price: monthly(40, () => 100),
      rent: monthly(13, (k) => (k === 12 ? 500 : 550)),
      yield: series([["2026-08", 0.042]]),
      renterProportion: 0.3,
    })
    expect(derived.pricePoints).toBe(37)
    expect(derived.metrics).toEqual({
      areaId: "NSW1",
      yieldNow: 0.042,
      rentGrowth12m: expect.closeTo(0.1, 12),
      priceGrowth36m: 0,
      renterProportion: 0.3,
      priceVolatility: 0,
    })
  })
})

describe("disabledFactorsFor (AC 6)", () => {
  it("disables low_volatility when fewer than half the survivors have 18+ points", () => {
    expect(disabledFactorsFor([37, 10, 10])).toEqual(["low_volatility"])
    expect(disabledFactorsFor([37, 37, 10, 10])).toEqual([])
    expect(disabledFactorsFor([17])).toEqual(["low_volatility"])
    expect(disabledFactorsFor([])).toEqual([])
  })
})
