import type { HtagCallRecorder } from "@my-ba/shared"
import type { z } from "zod"
import { htagClientConfigSchema, type HtagClientConfig } from "./config"
import {
  HTAG_BEDROOM_TREND_METRICS,
  HTAG_QUERY_PATH,
  HTAG_SAL_TO_LOCALITY_PATH,
  HTAG_SUMMARY_PATH,
  tierFor,
  trendPath,
  type HtagBedroomTrendMetric,
  type HtagTrendMetric,
} from "./endpoints"
import { HtagUnexpectedStatusError } from "./errors"
import { send, type HttpContext } from "./http"
import { consoleHtagLogger, type HtagLogger } from "./logger"
import {
  HTAG_TREND_ROW_SCHEMAS,
  marketQueryInputSchema,
  marketQueryRecordSchema,
  marketSummaryRecordSchema,
  salCodeSchema,
  salToLocalityRecordSchema,
  summaryParamsSchema,
  trendParamsSchema,
  type HtagBedrooms,
  type HtagLevel,
  type HtagTrendRow,
  type MarketQueryInput,
  type MarketQueryRow,
  type MarketSummaryRow,
  type SalToLocalityRow,
} from "./schemas"

export interface HtagRowsResult<Row> {
  rows: Row[]
  /** Rows that failed validation, were logged and skipped (AC 6). */
  invalidRowCount: number
}

export interface HtagQueryResult extends HtagRowsResult<MarketQueryRow> {
  /**
   * The page came back full (`rows returned === limit`), so there may be more
   * matches. D42: the HITL gate asks for tighter criteria; never auto-continue.
   */
  truncated: boolean
}

interface AreaParams {
  level: HtagLevel
  /** Sent comma-joined as `area_id` (Q13e). */
  areaIds: readonly string[]
  /** Sent as repeated `property_type` params. Multi-value is unverified against the live API. */
  propertyTypes?: ReadonlyArray<"house" | "unit">
}

interface PeriodParams {
  /** `YYYY-MM-DD`. Use for incremental fetches (D40). */
  periodEndMin?: string
  periodEndMax?: string
}

export type HtagSummaryParams = AreaParams & { bedrooms?: HtagBedrooms }

/** `bedrooms` exists only on price, rent and yield trends. */
export type HtagTrendParams<M extends HtagTrendMetric> = AreaParams &
  PeriodParams &
  (M extends HtagBedroomTrendMetric ? { bedrooms?: HtagBedrooms } : { bedrooms?: never })

export interface HtagClient {
  /** `POST /markets/query`. One page, never auto-paginated (D64). */
  queryMarkets(input: MarketQueryInput): Promise<HtagQueryResult>
  /** `GET /markets/summary`. Auto-paginated (D64). */
  summary(params: HtagSummaryParams): Promise<HtagRowsResult<MarketSummaryRow>>
  /** `GET /markets/trends/{metric}`. Auto-paginated (D64). */
  trends<M extends HtagTrendMetric>(
    metric: M,
    params: HtagTrendParams<M>,
  ): Promise<HtagRowsResult<HtagTrendRow<M>>>
  /**
   * `GET /reference/concordance/sal-to-locality` (P1-10, D72). One ABS SAL
   * code per call. Null when HtAG has no locality for the code (404) or the
   * body fails validation (logged).
   */
  salToLocality(salCode: string): Promise<SalToLocalityRow | null>
}

export interface HtagClientDeps {
  /** The spend ledger (D63). Required: there is no unrecorded HtAG call. */
  recorder: HtagCallRecorder
  logger?: HtagLogger
  fetch?: typeof fetch
  /** Injected for tests. */
  sleep?: (ms: number) => Promise<void>
  random?: () => number
}

function parseRows<S extends z.ZodType>(
  results: unknown[],
  schema: S,
  endpoint: string,
  logger: HtagLogger,
): HtagRowsResult<z.output<S>> {
  const rows: z.output<S>[] = []
  let invalidRowCount = 0
  results.forEach((raw, index) => {
    const parsed = schema.safeParse(raw)
    if (parsed.success) {
      rows.push(parsed.data)
      return
    }
    invalidRowCount++
    const areaId =
      raw !== null && typeof raw === "object" && "area_id" in raw ? raw.area_id : undefined
    logger.warn("Skipping HtAG row that failed validation", {
      endpoint,
      index,
      areaId,
      issues: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
    })
  })
  return { rows, invalidRowCount }
}

function areaQuery(params: {
  level: HtagLevel
  areaIds: readonly string[]
  propertyTypes?: readonly string[] | undefined
  bedrooms?: string | undefined
  periodEndMin?: string | undefined
  periodEndMax?: string | undefined
}): URLSearchParams {
  const query = new URLSearchParams()
  query.set("level", params.level)
  query.set("area_id", params.areaIds.join(","))
  for (const type of params.propertyTypes ?? []) query.append("property_type", type)
  if (params.bedrooms) query.set("bedrooms", params.bedrooms)
  if (params.periodEndMin) query.set("period_end_min", params.periodEndMin)
  if (params.periodEndMax) query.set("period_end_max", params.periodEndMax)
  return query
}

export function createHtagClient(config: HtagClientConfig, deps: HtagClientDeps): HtagClient {
  const resolved = htagClientConfigSchema.parse(config)
  const logger = deps.logger ?? consoleHtagLogger
  const ctx: HttpContext = {
    config: resolved,
    recorder: deps.recorder,
    logger,
    fetch: deps.fetch ?? globalThis.fetch,
    sleep: deps.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms))),
    random: deps.random ?? Math.random,
  }

  /**
   * D64: offset += limit until a page is shorter than `limit`. `total` is never read.
   *
   * Strictly sequential, one request in flight. Every page is billed per row, so
   * whether to fetch page n+1 depends on page n being full. Never "optimise" this
   * into parallel requests: fetching `maxPages` pages up front would bill for
   * pages past the end and burn the endpoint's monthly cap. Recursion rather than
   * a loop only to keep oxlint's no-await-in-loop quiet; depth is bounded by
   * `maxPages`.
   */
  async function paginate(
    path: string,
    base: URLSearchParams,
    page = 0,
    collected: unknown[] = [],
  ): Promise<unknown[]> {
    if (page >= resolved.maxPages) {
      throw new Error(`HtAG pagination exceeded maxPages (${resolved.maxPages}) for ${path}`)
    }
    const limit = resolved.pageSize
    const query = new URLSearchParams(base)
    query.set("limit", String(limit))
    query.set("offset", String(page * limit))
    const { results } = await send(ctx, { method: "GET", path, tier: tierFor(path), query })
    collected.push(...results)
    return results.length < limit ? collected : paginate(path, base, page + 1, collected)
  }

  return {
    async queryMarkets(input) {
      const body = marketQueryInputSchema.parse(input)
      const limit = body.limit ?? resolved.pageSize
      const { results } = await send(ctx, {
        method: "POST",
        path: HTAG_QUERY_PATH,
        tier: tierFor(HTAG_QUERY_PATH),
        body: { ...body, limit, offset: body.offset ?? 0 },
      })
      return {
        ...parseRows(results, marketQueryRecordSchema, HTAG_QUERY_PATH, logger),
        truncated: results.length === limit,
      }
    },

    async summary(params) {
      const parsed = summaryParamsSchema.parse(params)
      const results = await paginate(HTAG_SUMMARY_PATH, areaQuery(parsed))
      return parseRows(results, marketSummaryRecordSchema, HTAG_SUMMARY_PATH, logger)
    },

    async trends(metric, params) {
      const parsed = trendParamsSchema.parse(params)
      if (parsed.bedrooms && !(HTAG_BEDROOM_TREND_METRICS as readonly string[]).includes(metric)) {
        throw new Error(`HtAG ${metric} trends have no bedrooms dimension`)
      }
      const path = trendPath(metric)
      const results = await paginate(path, areaQuery(parsed))
      const schema = HTAG_TREND_ROW_SCHEMAS[metric]
      return parseRows(results, schema, path, logger) as HtagRowsResult<HtagTrendRow<typeof metric>>
    },

    async salToLocality(salCode) {
      const code = salCodeSchema.parse(salCode)
      const path = HTAG_SAL_TO_LOCALITY_PATH
      try {
        const { results } = await send(ctx, {
          method: "GET",
          path,
          tier: tierFor(path),
          query: new URLSearchParams({ sal_code: code }),
          envelope: "object",
        })
        return parseRows(results, salToLocalityRecordSchema, path, logger).rows[0] ?? null
      } catch (error) {
        // An unknown code is a 404 `{ detail: "No locality found for sal_code=…" }`,
        // captured 2026-10-08 (fixture concordance-sal-to-locality-unknown). Free.
        if (error instanceof HtagUnexpectedStatusError && error.status === 404) return null
        throw error
      }
    },
  }
}
