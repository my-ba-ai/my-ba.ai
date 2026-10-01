import type { HtagCallRecord, HtagCallRecorder } from "@my-ba/shared"
import { describe, expect, it } from "vitest"
import {
  fakeFetch,
  loadFixture,
  makeClient,
  sequence,
  TEST_API_KEY,
  toResponse,
  type Fixture,
} from "../test/helpers"
import {
  HtagAuthError,
  HtagBadRequestError,
  HtagBalanceExhaustedError,
  HtagNetworkError,
  HtagQuotaExceededError,
  HtagServerError,
} from "./errors"

const respond = (name: string, overrides?: Parameters<typeof toResponse>[1]) => () =>
  toResponse(loadFixture(name), overrides)

const ACT = { level: "suburb", areaIds: ["ACT101"], propertyTypes: ["house"] } as const

/** Build `count` trend rows from the captured price fixture's first row. */
function priceRows(count: number, offset: number) {
  const [template] = (loadFixture("trends-price").body as { results: Record<string, unknown>[] })
    .results
  return Array.from({ length: count }, (_, i) => ({
    ...template,
    period_end: new Date(Date.UTC(2026, 7 - offset - i, 1)).toISOString(),
  }))
}

function page(fixture: Fixture, results: unknown[], total = 999) {
  return () => toResponse(fixture, { body: { results, total } })
}

describe("contract: captured fixtures (AC 1)", () => {
  it("queryMarkets sends the logic body and parses the allow-listed record", async () => {
    const { fetch, calls } = sequence(respond("query-page"))
    const { client, recorder } = makeClient(fetch)

    const result = await client.queryMarkets({
      level: "suburb",
      property_types: ["house"],
      logic: {
        and: [
          { field: "bedrooms", eq: "All" },
          { field: "typical_price", gte: 100_000, lte: 550_000 },
        ],
      },
      limit: 3,
    })

    expect(result.invalidRowCount).toBe(0)
    expect(result.rows).toHaveLength(3)
    expect(result.rows[0]).toEqual({
      area_id: "NSW100",
      level: "suburb",
      period_end: "2026-08-31",
      area_name: "Ashley",
      state: "NSW",
      property_type: "house",
      bedrooms: "All",
      typical_price: 461_197,
      rent: 445,
      confidence: "low",
    })

    const [call] = calls
    expect(call?.url.pathname).toBe("/v1/markets/query")
    expect(call?.init.method).toBe("POST")
    expect(JSON.parse(String(call?.init.body))).toMatchObject({ limit: 3, offset: 0 })
    expect(recorder.calls).toHaveLength(1)
    expect(recorder.calls[0]).toMatchObject({
      endpoint: "/markets/query",
      tier: "premium",
      statusCode: 200,
      rowsReturned: 3,
      costAud: "0",
      costSource: "header",
      billedUnits: 3,
      billingTier: "free",
    })
  })

  it("summary normalises the timestamp period_end and capitalised confidence", async () => {
    const { fetch, calls } = sequence(respond("summary"))
    const { client } = makeClient(fetch)

    const { rows } = await client.summary({ ...ACT, bedrooms: "All" })

    expect(rows[0]).toMatchObject({
      area_id: "ACT101",
      period_end: "2026-08-31",
      bedrooms: "All",
      gross_yield: 0.0303,
      confidence: "medium",
    })
    const query = calls[0]?.url.searchParams
    expect(query?.get("area_id")).toBe("ACT101")
    expect(query?.get("bedrooms")).toBe("All")
    expect(query?.get("limit")).toBe("100")
    expect(query?.get("offset")).toBe("0")
  })

  it.each([
    ["price", "trends-price", { typical_price: 1_251_579, sales: 1 }],
    ["rent", "trends-rent", { median_rent: 730, rentals: 4 }],
    ["yield", "trends-yield", { yield_val: 0.0303 }],
    ["stock-on-market", "trends-stock-on-market", { som: 4, som_percent: 0.0044 }],
    ["days-on-market", "trends-days-on-market", { dom: 99, discounting: null }],
    ["vacancy", "trends-vacancy", { vacancy_rate: 0.0168 }],
  ] as const)("trends(%s) parses its captured fixture", async (metric, fixture, first) => {
    const { fetch, calls } = sequence(respond(fixture))
    const { client } = makeClient(fetch)

    const { rows, invalidRowCount } = await client.trends(metric, ACT)

    expect(invalidRowCount).toBe(0)
    expect(rows).toHaveLength(3)
    expect(rows[0]).toMatchObject({ area_id: "ACT101", period_end: "2026-08-31", ...first })
    expect(calls[0]?.url.pathname).toBe(`/v1/markets/trends/${metric}`)
  })

  it("keeps an all-null SOM row rather than dropping it", async () => {
    const { client } = makeClient(sequence(respond("trends-stock-on-market")).fetch)
    const { rows } = await client.trends("stock-on-market", ACT)
    expect(rows[2]).toMatchObject({ period_end: "2026-06-30", som: null, som_percent: null })
  })

  it("comma-joins area_id, repeats property_type and sends the key only as a header", async () => {
    const { fetch, calls } = sequence(respond("trends-price"))
    const { client, recorder } = makeClient(fetch)

    await client.trends("price", {
      level: "suburb",
      areaIds: ["ACT101", "ACT102"],
      propertyTypes: ["house", "unit"],
      periodEndMin: "2026-01-01",
    })

    const url = calls[0]?.url
    expect(url?.searchParams.get("area_id")).toBe("ACT101,ACT102")
    expect(url?.searchParams.getAll("property_type")).toEqual(["house", "unit"])
    expect(url?.searchParams.get("period_end_min")).toBe("2026-01-01")
    expect(url?.searchParams.has("bedrooms")).toBe(false)
    expect(new Headers(calls[0]?.init.headers).get("x-api-key")).toBe(TEST_API_KEY)
    expect(url?.toString()).not.toContain(TEST_API_KEY)
    expect(JSON.stringify(recorder.calls)).not.toContain(TEST_API_KEY)
  })
})

describe("pagination (AC 3, D64)", () => {
  it("trends: 100 + 100 + 37 → 237 rows in 3 requests, ignoring a wrong total", async () => {
    const fixture = loadFixture("trends-price")
    const { fetch, calls } = sequence(
      page(fixture, priceRows(100, 0)),
      page(fixture, priceRows(100, 100)),
      page(fixture, priceRows(37, 200)),
    )
    const { client, recorder } = makeClient(fetch)

    const { rows } = await client.trends("price", ACT)

    expect(rows).toHaveLength(237)
    expect(calls.map((c) => c.url.searchParams.get("offset"))).toEqual(["0", "100", "200"])
    expect(recorder.calls.map((c) => c.rowsReturned)).toEqual([100, 100, 37])
  })

  it("never has more than one request in flight (each page is billed)", async () => {
    const fixture = loadFixture("trends-price")
    const pages = [priceRows(100, 0), priceRows(100, 100), priceRows(37, 200)]
    let inFlight = 0
    let maxInFlight = 0
    const { fetch, calls } = fakeFetch(async (_, index) => {
      inFlight++
      maxInFlight = Math.max(maxInFlight, inFlight)
      await new Promise((resolve) => setTimeout(resolve, 5))
      inFlight--
      const results = pages[index]
      if (!results) throw new Error(`Unexpected request #${index + 1}`)
      return page(fixture, results)()
    })
    const { client } = makeClient(fetch)

    const { rows } = await client.trends("price", ACT)

    expect(rows).toHaveLength(237)
    expect(calls).toHaveLength(3)
    expect(maxInFlight).toBe(1)
  })

  it("stops on an empty page after a full one", async () => {
    const fixture = loadFixture("trends-price")
    const { fetch, calls } = sequence(page(fixture, priceRows(100, 0)), page(fixture, []))
    const { client } = makeClient(fetch)

    const { rows } = await client.trends("price", ACT)

    expect(rows).toHaveLength(100)
    expect(calls).toHaveLength(2)
  })

  it("stops at maxPages instead of looping forever", async () => {
    const fixture = loadFixture("trends-price")
    const { fetch } = fakeFetch(() => page(fixture, priceRows(2, 0))())
    const { client } = makeClient(fetch, { config: { pageSize: 2, maxPages: 3 } })

    await expect(client.trends("price", ACT)).rejects.toThrow(/maxPages/)
  })
})

describe("queryMarkets truncation (AC 4, D42)", () => {
  it("flags a full page as truncated and makes exactly one request", async () => {
    const { fetch, calls } = sequence(respond("query-page"))
    const { client } = makeClient(fetch)

    const result = await client.queryMarkets({
      level: "suburb",
      property_types: ["house"],
      limit: 3,
    })

    expect(result.truncated).toBe(true)
    expect(calls).toHaveLength(1)
  })

  it("does not flag a short page", async () => {
    const { client } = makeClient(sequence(respond("query-page")).fetch)
    const result = await client.queryMarkets({
      level: "suburb",
      property_types: ["house"],
      limit: 5,
    })
    expect(result.truncated).toBe(false)
  })

  it("defaults limit to pageSize", async () => {
    const { fetch, calls } = sequence(respond("query-zero-rows"))
    const { client } = makeClient(fetch)
    const result = await client.queryMarkets({ level: "suburb", property_types: ["house"] })
    expect(JSON.parse(String(calls[0]?.init.body)).limit).toBe(100)
    expect(result).toMatchObject({ rows: [], truncated: false })
  })

  it("rejects legacy price_range params and malformed logic before any request", async () => {
    const { fetch, calls } = sequence()
    const { client } = makeClient(fetch)

    await expect(
      client.queryMarkets({
        level: "suburb",
        property_types: ["house"],
        // @ts-expect-error D42: logic DSL only
        typical_price_min: 1,
      }),
    ).rejects.toThrow()
    await expect(
      client.queryMarkets({
        level: "suburb",
        property_types: ["house"],
        logic: { field: "typical_price" },
      }),
    ).rejects.toThrow()
    expect(calls).toHaveLength(0)
  })
})

describe("errors (AC 5)", () => {
  it("400 from /markets/query carries detail, is not retried, is recorded unbilled", async () => {
    const { fetch, calls } = sequence(respond("query-400"))
    const { client, recorder } = makeClient(fetch)

    const error = await client
      .queryMarkets({ level: "suburb", property_types: ["house"] })
      .catch((e: unknown) => e)

    expect(error).toBeInstanceOf(HtagBadRequestError)
    expect((error as HtagBadRequestError).detail).toBe(
      "Unknown market query field: not_a_real_field",
    )
    expect(calls).toHaveLength(1)
    expect(recorder.calls).toEqual([
      expect.objectContaining({
        statusCode: 400,
        costAud: "0",
        costSource: "none",
        rowsReturned: 0,
      }),
    ])
  })

  it("400 validation failure carries errors[]", async () => {
    const { client } = makeClient(sequence(respond("trends-price-400")).fetch)
    const error = await client.trends("price", ACT).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(HtagBadRequestError)
    expect((error as HtagBadRequestError).errors).toHaveLength(1)
  })

  it("401 → HtagAuthError", async () => {
    const { client } = makeClient(sequence(respond("query-401")).fetch)
    await expect(
      client.queryMarkets({ level: "suburb", property_types: ["house"] }),
    ).rejects.toBeInstanceOf(HtagAuthError)
  })

  it("402 → HtagBalanceExhaustedError with the reported balance", async () => {
    const { fetch, calls } = sequence(respond("synthetic/trends-days-on-market-402"))
    const { client } = makeClient(fetch)
    const error = await client.trends("days-on-market", ACT).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(HtagBalanceExhaustedError)
    expect((error as HtagBalanceExhaustedError).balance).toBe("0")
    expect(calls).toHaveLength(1)
  })

  it("429 → HtagQuotaExceededError with the rate-limit headers", async () => {
    const { client } = makeClient(sequence(respond("synthetic/query-429")).fetch)
    const error = await client
      .queryMarkets({ level: "suburb", property_types: ["house"] })
      .catch((e: unknown) => e)
    expect(error).toBeInstanceOf(HtagQuotaExceededError)
    expect(error).toMatchObject({
      retryAfterSeconds: 86_400,
      rateLimitLimit: 10_000,
      rateLimitRemaining: 0,
      rateLimitReset: 1_790_812_800,
    })
  })

  it("5xx is retried to maxAttempts with backoff, one ledger row per attempt", async () => {
    const r500 = respond("synthetic/trends-price-500")
    const { fetch, calls } = sequence(r500, r500, r500)
    const { client, recorder, sleeps } = makeClient(fetch)

    await expect(client.trends("price", ACT)).rejects.toBeInstanceOf(HtagServerError)
    expect(calls).toHaveLength(3)
    expect(recorder.calls.map((c) => c.statusCode)).toEqual([500, 500, 500])
    expect(sleeps).toEqual([250, 500])
  })

  it("recovers when a retry succeeds", async () => {
    const { fetch } = sequence(respond("synthetic/trends-price-500"), respond("trends-price"))
    const { client, recorder } = makeClient(fetch)

    const { rows } = await client.trends("price", ACT)

    expect(rows).toHaveLength(3)
    expect(recorder.calls.map((c) => c.statusCode)).toEqual([500, 200])
  })

  it("network errors are retried, recorded with no status, then thrown", async () => {
    const { fetch, calls } = fakeFetch(() => {
      throw new TypeError("fetch failed")
    })
    const { client, recorder } = makeClient(fetch)

    await expect(client.trends("price", ACT)).rejects.toBeInstanceOf(HtagNetworkError)
    expect(calls).toHaveLength(3)
    expect(recorder.calls.every((c) => c.statusCode === null && c.costSource === "none")).toBe(true)
  })
})

describe("row validation (AC 6)", () => {
  it("logs and skips a bad row, returns the count, does not throw", async () => {
    const fixture = loadFixture("trends-price")
    const body = fixture.body as { results: Record<string, unknown>[] }
    body.results[1] = { ...body.results[1], period_end: "last tuesday" }
    const { client, logger } = makeClient(sequence(() => toResponse(fixture, { body })).fetch)

    const { rows, invalidRowCount } = await client.trends("price", ACT)

    expect(rows).toHaveLength(2)
    expect(invalidRowCount).toBe(1)
    expect(logger.entries).toContainEqual(
      expect.objectContaining({
        level: "warn",
        message: "Skipping HtAG row that failed validation",
      }),
    )
  })
})

function withFirstRow(name: string, patch: Record<string, unknown>) {
  const fixture = loadFixture(name)
  const body = fixture.body as { results: Record<string, unknown>[] }
  body.results[0] = { ...body.results[0], ...patch }
  return () => toResponse(fixture, { body })
}

describe("normalisation (AC 7)", () => {
  it("DOM 0 → null (Q13)", async () => {
    const { client } = makeClient(sequence(withFirstRow("trends-days-on-market", { dom: 0 })).fetch)
    const { rows } = await client.trends("days-on-market", ACT)
    expect(rows[0]?.dom).toBeNull()
    expect(rows[1]?.dom).toBe(45)
  })

  it("vacancy -1 → null", async () => {
    const { client } = makeClient(
      sequence(withFirstRow("trends-vacancy", { vacancy_rate: -1 })).fetch,
    )
    const { rows } = await client.trends("vacancy", ACT)
    expect(rows[0]?.vacancy_rate).toBeNull()
  })

  it("SOM 0 is data, not a gap", async () => {
    const { client } = makeClient(
      sequence(withFirstRow("trends-stock-on-market", { som: 0, som_percent: 0 })).fetch,
    )
    const { rows } = await client.trends("stock-on-market", ACT)
    expect(rows[0]).toMatchObject({ som: 0, som_percent: 0 })
  })

  it("rejects bedrooms on a trend that has none", async () => {
    const { client } = makeClient(sequence().fetch)
    await expect(
      // @ts-expect-error DOM has no bedrooms dimension
      client.trends("days-on-market", { ...ACT, bedrooms: "3" }),
    ).rejects.toThrow(/no bedrooms/)
  })
})

describe("cost of record (AC 8, D62)", () => {
  it("uses X-Billing-Cost and the billing headers when present", async () => {
    const { client, recorder } = makeClient(sequence(respond("trends-days-on-market")).fetch)
    await client.trends("days-on-market", ACT)
    expect(recorder.calls[0]).toEqual({
      endpoint: "/markets/trends/days-on-market",
      request: {
        level: "suburb",
        area_id: "ACT101",
        property_type: "house",
        limit: "100",
        offset: "0",
      },
      tier: "restricted",
      statusCode: 200,
      rowsReturned: 3,
      costAud: "0.666",
      costSource: "header",
      billedUnits: 3,
      billingBalanceAud: "24.334",
      billingTier: "tier1",
    })
  })

  it("falls back to rows × configured rate when a 2xx has no billing headers", async () => {
    const fixture = loadFixture("trends-days-on-market")
    const headers = Object.fromEntries(
      Object.entries(fixture.headers).filter(([name]) => !name.startsWith("x-billing-")),
    )
    const { client, recorder, logger } = makeClient(
      sequence(() => toResponse(fixture, { headers })).fetch,
    )

    await client.trends("days-on-market", ACT)

    expect(recorder.calls[0]).toMatchObject({
      costAud: "0.6660",
      costSource: "config_estimate",
      billedUnits: null,
      billingBalanceAud: null,
      billingTier: null,
    })
    expect(logger.entries.some((e) => e.level === "warn")).toBe(true)
  })
})

describe("ledger failure (AC 9, D63)", () => {
  it("logs at error level and still returns the data", async () => {
    const failing: HtagCallRecorder = {
      record: async (_call: HtagCallRecord) => {
        throw new Error("connection refused")
      },
    }
    const { fetch } = sequence(respond("trends-days-on-market"))
    const { client, logger } = makeClient(fetch, { recorder: failing })

    const { rows } = await client.trends("days-on-market", ACT)

    expect(rows).toHaveLength(3)
    expect(logger.entries).toContainEqual(
      expect.objectContaining({
        level: "error",
        message: "Failed to record HtAG call in the spend ledger; continuing",
      }),
    )
  })
})
