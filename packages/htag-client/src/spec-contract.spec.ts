import { describe, expect, it } from "vitest"
import type { z } from "zod"
import { capturedFixtures, loadOpenApi } from "../test/helpers"
import { HTAG_ENDPOINT_TIERS, HTAG_QUERY_PATH, HTAG_SAL_TO_LOCALITY_PATH } from "./endpoints"
import {
  daysOnMarketTrendRecordSchema,
  htagEnvelopeSchema,
  marketQueryRecordSchema,
  marketSummaryRecordSchema,
  priceTrendRecordSchema,
  rentTrendRecordSchema,
  salToLocalityRecordSchema,
  stockOnMarketTrendRecordSchema,
  vacancyTrendRecordSchema,
  yieldTrendRecordSchema,
} from "./schemas"

/**
 * D61: the Zod schemas are hand-written against docs/htag/openapi.json. These
 * tests make a re-downloaded spec that changes shape or pricing fail loudly.
 */
const spec = loadOpenApi()

const ROW_SCHEMAS: Record<string, z.ZodObject> = {
  PublicMarketQueryRecord: marketQueryRecordSchema,
  MarketSummaryRecord: marketSummaryRecordSchema,
  ExternalPriceHistoryOut: priceTrendRecordSchema,
  ExternalRentHistoryOut: rentTrendRecordSchema,
  YieldHistoryOut: yieldTrendRecordSchema,
  StockOnMarketTrendRecord: stockOnMarketTrendRecordSchema,
  DaysOnMarketTrendRecord: daysOnMarketTrendRecordSchema,
  VacancyTrendRecord: vacancyTrendRecordSchema,
  SalToLocalityResponse: salToLocalityRecordSchema,
}

/** Where the live API (captured fixtures) contradicts the spec: spec field → live field. */
const LIVE_DIVERGENCES: Record<string, Record<string, string>> = {
  YieldHistoryOut: { yield: "yield_val" },
}

describe("row schemas vs docs/htag/openapi.json (AC 2)", () => {
  it.each(Object.entries(ROW_SCHEMAS))("%s has the spec's field set", (component, schema) => {
    const properties = spec.components.schemas[component]?.properties
    expect(properties, `${component} missing from the spec`).toBeDefined()
    const renames = LIVE_DIVERGENCES[component] ?? {}
    const expected = Object.keys(properties ?? {}).map((key) => renames[key] ?? key)
    expect(Object.keys(schema.shape).toSorted()).toEqual(expected.toSorted())
  })
})

describe("endpoint value tiers vs x-htg-pricingTier (D61, D62)", () => {
  it.each(Object.entries(HTAG_ENDPOINT_TIERS))("%s is %s", (path, tier) => {
    const method = path === HTAG_QUERY_PATH ? "post" : "get"
    const operation = spec.paths[path]?.[method]
    expect(operation, `${method.toUpperCase()} ${path} missing from the spec`).toBeDefined()
    expect(String(operation?.["x-htg-pricingTier"]).toLowerCase()).toBe(tier)
  })
})

const schemaFor = (path: string) => {
  if (path === HTAG_QUERY_PATH) return marketQueryRecordSchema
  if (path === "/markets/summary") return marketSummaryRecordSchema
  if (path === HTAG_SAL_TO_LOCALITY_PATH) return salToLocalityRecordSchema
  const metric = path.replace("/markets/trends/", "")
  return {
    price: priceTrendRecordSchema,
    rent: rentTrendRecordSchema,
    yield: yieldTrendRecordSchema,
    "stock-on-market": stockOnMarketTrendRecordSchema,
    "days-on-market": daysOnMarketTrendRecordSchema,
    vacancy: vacancyTrendRecordSchema,
  }[metric]
}

describe("captured fixtures parse (AC 2)", () => {
  const successes = capturedFixtures().filter((f) => f.status >= 200 && f.status < 300)

  it("there is a captured 2xx fixture for every endpoint the client calls", () => {
    const paths = new Set(successes.map((f) => f.request.path))
    for (const path of Object.keys(HTAG_ENDPOINT_TIERS)) expect(paths).toContain(path)
  })

  it.each(successes.map((f) => [f.name, f] as const))("%s", (_, fixture) => {
    const schema = schemaFor(fixture.request.path)
    expect(schema).toBeDefined()
    // Concordance endpoints answer with one bare object, not `{ results }` (P1-10).
    const results =
      fixture.request.path === HTAG_SAL_TO_LOCALITY_PATH
        ? [fixture.body]
        : htagEnvelopeSchema.parse(fixture.body).results
    for (const row of results) expect(schema?.safeParse(row).success).toBe(true)
  })

  it("no fixture contains an x-api-key request header", () => {
    for (const fixture of capturedFixtures()) {
      expect(Object.keys(fixture.headers)).not.toContain("x-api-key")
    }
  })
})
