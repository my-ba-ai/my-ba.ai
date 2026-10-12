import {
  estimateScreeningCostCeiling,
  HtagBalanceExhaustedError,
  HtagQuotaExceededError,
} from "@my-ba/htag-client"
import { describe, expect, it } from "vitest"
import { StageFailedError } from "../stage-failure"
import {
  areas,
  CURRENT_PERIOD,
  FakePorts,
  TASK_ID,
  TENANT_ID,
  validCriteria,
} from "../../test/screening-fakes"
import { DEFAULT_SCREENING_CONFIG, type ScreeningConfig } from "./config"
import { runScreening } from "./screen"

const config = (overrides: Partial<ScreeningConfig> = {}): ScreeningConfig => ({
  ...DEFAULT_SCREENING_CONFIG,
  ...overrides,
})

const run = (ports: FakePorts, overrides: Partial<ScreeningConfig> = {}, attempt = 1) =>
  runScreening(ports, { tenantId: TENANT_ID, taskId: TASK_ID, attempt, config: config(overrides) })

const TRENDS = ["/markets/trends/price", "/markets/trends/rent", "/markets/trends/yield"]
const SUPPLY = [
  "/markets/trends/stock-on-market",
  "/markets/trends/days-on-market",
  "/markets/trends/vacancy",
]

describe("runScreening (P1-4)", () => {
  it("AC 1: returned == limit → too-broad gate and zero trends calls", async () => {
    const ports = new FakePorts()
    ports.htag.queryRows = areas(10)

    const result = await run(ports, { queryLimit: 10 })

    expect(result.kind).toBe("too_broad")
    if (result.kind !== "too_broad") return
    expect(result.gate).toMatchObject({
      kind: "SCREENING_TOO_BROAD",
      returned: 10,
      limit: 10,
      attempt: 1,
    })
    expect(ports.htag.ledger.map((e) => e.endpoint)).toEqual(["/markets/query"])
    expect(ports.suburbs.size).toBe(0)
    const [step] = [...ports.steps.values()]
    expect(step).toMatchObject({ status: "completed", outcome: "too_broad" })
  })

  it("AC 2: zero results → approval gate with an empty list and cost 0", async () => {
    const ports = new FakePorts()
    ports.htag.queryRows = []

    const result = await run(ports)

    expect(result.kind).toBe("ranked")
    if (result.kind !== "ranked") return
    expect(result.gate.rankedSuburbs).toEqual([])
    expect(result.gate.costAud).toBe("0.0000")
    expect(result.gate.renterCoverage).toBeNull()
    expect(ports.htag.ledger.map((e) => e.endpoint)).toEqual(["/markets/query"])
  })

  it("ranks survivors, writes results and gives the top N supply detail", async () => {
    const ports = new FakePorts()
    ports.htag.queryRows = areas(12)

    const result = await run(ports, { restrictedTopN: 3 })

    if (result.kind !== "ranked") throw new Error("expected ranked")
    const ranked = result.gate.rankedSuburbs
    expect(ranked).toHaveLength(12)
    expect(ranked.map((s) => s.rank)).toEqual(Array.from({ length: 12 }, (_, i) => i + 1))
    expect(ranked.filter((s) => s.supply !== null)).toHaveLength(3)
    expect(ranked[0]?.supply).toMatchObject({
      periodEnd: CURRENT_PERIOD,
      somPercent: 0.01,
      daysOnMarket: 40,
      vacancyRate: 0.015,
    })
    // 36-month growth from 37 points; 12-month rent growth from 13.
    expect(ranked[0]?.raw.priceGrowth36m).not.toBeNull()
    expect(ranked[0]?.raw.rentGrowth12m).not.toBeNull()
    expect(ranked[0]?.raw.yieldNow).not.toBeNull()
    const step = [...ports.steps.values()][0]!
    expect(step).toMatchObject({ status: "completed", outcome: "ranked" })
    expect(step.results).toHaveLength(12)
    expect(step.results.filter((r) => r.shortlisted)).toHaveLength(3)
    for (const endpoint of SUPPLY) {
      expect(ports.htag.calls(endpoint).flatMap((c) => c.areaIds)).toHaveLength(3)
    }
  })

  it("requests 37 price, 13 rent and 1 yield point per uncached suburb (D68)", async () => {
    const ports = new FakePorts()
    ports.htag.queryRows = areas(2)
    await run(ports, { restrictedTopN: 0 })
    const rows = (endpoint: string) =>
      ports.htag.calls(endpoint).reduce((sum, c) => sum + c.rows, 0)
    expect(rows("/markets/trends/price")).toBe(2 * 37)
    expect(rows("/markets/trends/rent")).toBe(2 * 13)
    expect(rows("/markets/trends/yield")).toBe(2)
  })

  it("AC 3: suburbs cached for the current period are left out of the trend requests", async () => {
    const ports = new FakePorts()
    ports.htag.queryRows = areas(4)
    await run(ports)
    // A second task screens the same 4 plus 2 new suburbs.
    ports.htag.queryRows = areas(6)
    ports.htag.ledger.length = 0

    await run(ports, {}, 2)

    for (const endpoint of TRENDS) {
      const requested = ports.htag.calls(endpoint).flatMap((c) => c.areaIds)
      expect(requested.toSorted()).toEqual(["NSW1004", "NSW1005"])
    }
  })

  it("AC 3: a cache one month behind fetches only the missing month", async () => {
    const ports = new FakePorts()
    ports.htag.queryRows = areas(1)
    await run(ports)
    // Drop the current month from the cache: as if last month's run filled it.
    ports.evictPoints((p) => p.periodEnd === CURRENT_PERIOD)
    ports.htag.ledger.length = 0

    await run(ports, {}, 2)

    const price = ports.htag.calls("/markets/trends/price")
    expect(price).toHaveLength(1)
    expect(price[0]?.rows).toBe(1)
  })

  it("AC 4: costAud is summed from the ledger for the step", async () => {
    const ports = new FakePorts()
    ports.htag.queryRows = areas(5)
    const result = await run(ports)
    if (result.kind !== "ranked") throw new Error("expected ranked")
    const step = [...ports.steps.values()][0]!
    expect(result.gate.costAud).toBe(ports.htag.costFor(step.id).toFixed(4))
    expect(step.costAud).toBe(result.gate.costAud)
    // Reference-data calls (postcodes) bill the system tenant, not the step.
    expect(
      ports.htag.ledger
        .filter((e) => e.stepId === null)
        .every((e) => e.endpoint === "/reference/locality"),
    ).toBe(true)
  })

  it.each([
    [
      "HTAG_QUOTA_EXCEEDED",
      new HtagQuotaExceededError("/markets/trends/price", {}, null, null, null, null),
    ],
    ["HTAG_BALANCE_EXHAUSTED", new HtagBalanceExhaustedError("/markets/trends/price", {})],
  ])("AC 5: %s fails the step with a typed reason, and a retry succeeds", async (reason, error) => {
    const ports = new FakePorts()
    ports.htag.queryRows = areas(3)
    ports.htag.failWith = { endpoint: "/markets/trends/price", error }

    const failure = await run(ports).catch((e: unknown) => e)
    expect(failure).toBeInstanceOf(StageFailedError)
    expect((failure as StageFailedError).reason).toBe(reason)
    expect((failure as Error).message).toMatch(new RegExp(`^\\[${reason}\\]`))
    const step = [...ports.steps.values()][0]!
    expect(step).toMatchObject({ status: "failed", failureReason: reason })

    // Same attempt again once resolved: the row is reused and completes.
    const retried = await run(ports)
    expect(retried.kind).toBe("ranked")
    expect(ports.steps.size).toBe(1)
    expect(step.status).toBe("completed")
  })

  it("invalid stored criteria fail with INVALID_CRITERIA before any HtAG call", async () => {
    const ports = new FakePorts()
    ports.criteria = { states: ["NSW"] }
    await expect(run(ports)).rejects.toThrow(/^\[INVALID_CRITERIA\]/)
    expect(ports.htag.ledger).toHaveLength(0)
  })

  it("AC 6: low_volatility is disabled run-wide when most survivors lack 18 price points", async () => {
    const ports = new FakePorts()
    ports.htag.queryRows = areas(4).map((a, i) => ({ ...a, priceHistory: i === 0 ? 60 : 12 }))
    ports.criteria = validCriteria({
      profile: { ...validCriteria().profile, risk: "low" } as never,
    })
    const result = await run(ports)
    if (result.kind !== "ranked") throw new Error("expected ranked")
    expect(result.gate.disabledFactors).toEqual(["low_volatility"])
    const breakdown = [...ports.steps.values()][0]!.results[0]!.ranked as {
      breakdown: Record<string, { status: string }>
    }
    expect(breakdown.breakdown.low_volatility?.status).toBe("disabled")
  })

  it("AC 6: a minority short of 18 points keeps the factor, null for them", async () => {
    const ports = new FakePorts()
    ports.htag.queryRows = areas(4).map((a, i) => ({ ...a, priceHistory: i === 0 ? 12 : 60 }))
    const result = await run(ports)
    if (result.kind !== "ranked") throw new Error("expected ranked")
    expect(result.gate.disabledFactors).toEqual([])
    const short = result.gate.rankedSuburbs.find((s) => s.areaId === "NSW1000")
    expect(short?.raw.priceVolatility).toBeNull()
    expect(short?.raw.priceGrowth36m).toBeNull()
  })

  it("AC 7: first run ≤ $26.30 and a repeat on cached suburbs ≤ ~$16.10 at configured rates", async () => {
    const ceiling = estimateScreeningCostCeiling().ceilingAud
    expect(ceiling).toBeCloseTo(26.3, 2)

    const ports = new FakePorts()
    // The most a non-truncated query can return: limit − 1.
    ports.htag.queryRows = areas(99)
    const first = await run(ports)
    if (first.kind !== "ranked") throw new Error("expected ranked")
    expect(Number(first.gate.costAud)).toBeLessThanOrEqual(26.3)

    const repeat = await run(ports, {}, 2)
    if (repeat.kind !== "ranked") throw new Error("expected ranked")
    expect(Number(repeat.gate.costAud)).toBeLessThanOrEqual(16.1)
  })

  it("AC 8: SCREEN_STATES_OVERRIDE restricts states without code change", async () => {
    const ports = new FakePorts()
    ports.criteria = validCriteria({ states: ["NSW", "VIC", "QLD"] })
    ports.htag.queryRows = areas(2, "QLD")
    const result = await run(ports, { statesOverride: ["QLD"] })
    expect(result.gate.criteria.states).toEqual(["QLD"])
  })

  it("reports renter coverage (P1-10 AC 1) and drops suburbs with no postcode", async () => {
    const ports = new FakePorts()
    ports.htag.queryRows = areas(4)
    ports.noPostcode.add("NSW1003")
    ports.renter = new Map([["SAL01000", 0.25]])
    const result = await run(ports)
    if (result.kind !== "ranked") throw new Error("expected ranked")
    expect(result.gate.droppedAreaIds).toEqual(["NSW1003"])
    expect(result.gate.rankedSuburbs).toHaveLength(3)
    expect(result.gate.renterCoverage).toBeCloseTo(1 / 3, 9)
  })
})
