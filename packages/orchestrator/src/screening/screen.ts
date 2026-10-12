import type { AnalysisFailureReason, DiscoveredSuburb, KnownSuburb, MetricPoint } from "@my-ba/db"
import { rankSuburbs, type Ranked } from "@my-ba/domain"
import {
  compileScreeningQuery,
  HtagBalanceExhaustedError,
  HtagQuotaExceededError,
  type HtagClient,
  type HtagTrendMetric,
  type MarketQueryRow,
} from "@my-ba/htag-client"
import {
  auStateSchema,
  criteriaSchema,
  screeningApprovalGateSchema,
  screeningTooBroadGateSchema,
  type AuState,
  type Criteria,
  type ScreenedSuburb,
  type ScreeningApprovalGate,
  type ScreeningTooBroadGate,
} from "@my-ba/shared"
import { StageFailedError } from "../stage-failure"
import type { ScreeningConfig } from "./config"
import {
  deriveRawMetrics,
  disabledFactorsFor,
  REFERENCE_SERIES,
  SUPPLY_SERIES,
  type MonthlySeries,
} from "./metrics"
import { monthKey, shiftMonths, windowStart, type MonthKey } from "./periods"
import type { ScreeningPorts } from "./ports"

export interface ScreenInput {
  tenantId: string
  taskId: string
  /** 1-based attempt within the stage's thread. */
  attempt: number
  config: ScreeningConfig
}

export type ScreenResult =
  | { kind: "too_broad"; gate: ScreeningTooBroadGate }
  | { kind: "ranked"; gate: ScreeningApprovalGate }

export interface ScreenLogger {
  info(message: string, context?: Record<string, unknown>): void
  warn(message: string, context?: Record<string, unknown>): void
}

const silentLogger: ScreenLogger = { info: () => undefined, warn: () => undefined }

/** One survivor of the query, with its suburb row and current period. */
interface Survivor {
  areaId: string
  suburb: KnownSuburb
  /** `/markets/query` `period_end`: the suburb's current measurement (D40). */
  periodEnd: string
  current: MonthKey
}

/** suburbId → metric name → month → value. */
type SeriesStore = Map<string, Map<string, Map<MonthKey, number>>>

/**
 * The Suburb Screener, steps 1–8 (P1-4). Everything that costs money happens
 * here, in one LangGraph node, so a gate resume never re-runs it (resuming
 * re-executes the interrupting node from the top). Returns the payload for
 * the gate that follows; the graph does the interrupting.
 *
 * Failures: a quota or balance error from HtAG fails the step with a typed
 * reason and throws `StageFailedError`, which fails the node. The thread
 * keeps its last checkpoint, so `runStage` can retry once the cause is fixed
 * (AC 5). Any other error is recorded as `UNEXPECTED` and is retryable the
 * same way.
 */
export async function runScreening(
  ports: ScreeningPorts,
  input: ScreenInput,
  logger: ScreenLogger = silentLogger,
): Promise<ScreenResult> {
  const { tenantId, taskId, attempt, config } = input

  const stored = await ports.loadCriteria(tenantId, taskId)
  if (stored === null || stored === undefined) {
    throw new StageFailedError("TASK_NOT_FOUND", `task ${taskId} is not visible to its tenant`)
  }

  const parsed = criteriaSchema.safeParse(stored)
  if (!parsed.success) {
    const stepId = await ports.beginStep({
      tenantId,
      taskId,
      attempt,
      presetVersion: null,
      weightsCustomised: null,
      filtersCustomised: null,
    })
    const detail = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ")
    await ports.failStep({ tenantId, analysisStepId: stepId, reason: "INVALID_CRITERIA", detail })
    throw new StageFailedError("INVALID_CRITERIA", detail)
  }
  const criteria = applyStatesOverride(parsed.data, config)

  const analysisStepId = await ports.beginStep({
    tenantId,
    taskId,
    attempt,
    presetVersion: criteria.profile.presetVersion,
    weightsCustomised: criteria.profile.weightsCustomised,
    filtersCustomised: criteria.profile.filtersCustomised,
  })
  const client = ports.htagClient({ tenantId, taskId, analysisStepId })
  const query = compileScreeningQuery(criteria, { limit: config.queryLimit })
  const request: Record<string, unknown> = {
    query,
    config: { ...config },
    statesOverridden: config.statesOverride !== null,
  }
  const base = { stage: "screening" as const, analysisStepId, attempt, criteria }

  try {
    // Step 1.
    const result = await client.queryMarkets(query)

    // Step 2: a full page means there may be more. Stop; no further calls (AC 1, D42).
    if (result.truncated) {
      const costAud = await ports.completeStep({
        tenantId,
        taskId,
        analysisStepId,
        outcome: "too_broad",
        request,
        result: { returned: result.rows.length, invalidRowCount: result.invalidRowCount },
        results: [],
      })
      logger.info("screening too broad", { taskId, attempt, returned: result.rows.length })
      return {
        kind: "too_broad",
        gate: screeningTooBroadGateSchema.parse({
          kind: "SCREENING_TOO_BROAD",
          ...base,
          costAud,
          returned: result.rows.length,
          limit: config.queryLimit,
        }),
      }
    }

    // Step 3.
    const { discovered, rowsByArea, unparseable } = discover(result.rows)
    const { known, dropped } =
      discovered.length > 0
        ? await ports.ensureSuburbs(discovered)
        : { known: new Map<string, KnownSuburb>(), dropped: [] }
    const droppedAreaIds = [...unparseable, ...dropped]
    if (droppedAreaIds.length > 0) {
      logger.warn("screened suburbs dropped (no postcode or conflicting row)", { droppedAreaIds })
    }
    const survivors: Survivor[] = discovered.flatMap((d) => {
      const suburb = known.get(d.htagAreaId)
      const row = rowsByArea.get(d.htagAreaId)
      if (!suburb || !row) return []
      return [
        {
          areaId: d.htagAreaId,
          suburb,
          periodEnd: row.period_end,
          current: monthKey(row.period_end),
        },
      ]
    })

    // Step 4: Reference-tier history, cache first (AC 3).
    const store: SeriesStore = new Map()
    const reference = await hydrate(ports, client, {
      survivors,
      propertyType: criteria.propertyType,
      store,
      batchSize: config.trendBatchSize,
      series: REFERENCE_SERIES.map((s) => ({ ...s })),
    })

    // Step 5: ABS renter proportion (P1-10).
    const salCodes = survivors.flatMap((s) => (s.suburb.absSalCode ? [s.suburb.absSalCode] : []))
    const renter = await ports.renterProportions(salCodes)

    // Step 6.
    const derived = survivors.map((s) =>
      deriveRawMetrics({
        areaId: s.areaId,
        periodEnd: s.periodEnd,
        price: seriesOf(store, s, "typical_price"),
        rent: seriesOf(store, s, "median_rent"),
        yield: seriesOf(store, s, "yield_val"),
        renterProportion: s.suburb.absSalCode ? (renter.get(s.suburb.absSalCode) ?? null) : null,
      }),
    )
    const disabledFactors = disabledFactorsFor(derived.map((d) => d.pricePoints))
    const ranked: Ranked[] =
      survivors.length > 0
        ? rankSuburbs(
            derived.map((d) => d.metrics),
            criteria.profile.weights,
            { disabledFactors },
          )
        : []

    // Step 7: Restricted-tier supply detail for the top N with enough data.
    const bySurvivor = new Map(survivors.map((s) => [s.areaId, s]))
    const shortlist = ranked
      .filter((r) => !r.insufficientData)
      .slice(0, config.restrictedTopN)
      .flatMap((r) => bySurvivor.get(r.areaId) ?? [])
    const supply = await hydrate(ports, client, {
      survivors: shortlist,
      propertyType: criteria.propertyType,
      store,
      batchSize: config.trendBatchSize,
      series: SUPPLY_SERIES.map((s) => ({ ...s, points: 1 })),
    })
    const shortlisted = new Set(shortlist.map((s) => s.areaId))

    // Step 8.
    const metricsByArea = new Map(derived.map((d) => [d.metrics.areaId, d.metrics]))
    const rankedByArea = new Map(ranked.map((r) => [r.areaId, r]))
    const screened: ScreenedSuburb[] = ranked.map((r) => {
      const survivor = bySurvivor.get(r.areaId)
      if (!survivor) throw new Error(`ranked area ${r.areaId} has no survivor`)
      const m = metricsByArea.get(r.areaId)
      return {
        rank: r.rank,
        areaId: r.areaId,
        suburbId: survivor.suburb.id,
        name: survivor.suburb.name,
        state: survivor.suburb.state,
        postcode: survivor.suburb.postcode,
        score: r.score,
        coverage: r.coverage,
        insufficientData: r.insufficientData,
        raw: {
          yieldNow: m?.yieldNow ?? null,
          rentGrowth12m: m?.rentGrowth12m ?? null,
          priceGrowth36m: m?.priceGrowth36m ?? null,
          renterProportion: m?.renterProportion ?? null,
          priceVolatility: m?.priceVolatility ?? null,
        },
        supply: shortlisted.has(r.areaId) ? supplyDetail(store, survivor) : null,
      }
    })
    const withRenter = screened.filter((s) => s.raw.renterProportion !== null).length
    const renterCoverage = screened.length > 0 ? withRenter / screened.length : null

    const costAud = await ports.completeStep({
      tenantId,
      taskId,
      analysisStepId,
      outcome: "ranked",
      request: { ...request, trends: [...reference.requests, ...supply.requests] },
      result: {
        returned: result.rows.length,
        invalidRowCount: result.invalidRowCount,
        survivors: survivors.length,
        droppedAreaIds,
        cache: { reference: reference.stats, supply: supply.stats },
        disabledFactors,
        renterCoverage,
        pricePoints: derived.map((d) => ({ areaId: d.metrics.areaId, points: d.pricePoints })),
      },
      results: screened.map((s) => {
        const r = rankedByArea.get(s.areaId)!
        return {
          suburbId: s.suburbId,
          htagAreaId: s.areaId,
          rank: s.rank,
          score: s.score,
          coverage: s.coverage,
          insufficientData: s.insufficientData,
          ranked: r as unknown as Record<string, unknown>,
          supply: s.supply,
          shortlisted: shortlisted.has(s.areaId),
        }
      }),
    })
    logger.info("screening ranked", {
      taskId,
      attempt,
      survivors: survivors.length,
      costAud,
      renterCoverage,
    })

    // Step 9's payload; the graph interrupts with it.
    return {
      kind: "ranked",
      gate: screeningApprovalGateSchema.parse({
        kind: "SCREENING_APPROVAL",
        ...base,
        costAud,
        rankedSuburbs: screened,
        disabledFactors,
        renterCoverage,
        droppedAreaIds,
      }),
    }
  } catch (error) {
    const reason = failureReasonOf(error)
    const detail = error instanceof Error ? error.message : String(error)
    try {
      await ports.failStep({ tenantId, analysisStepId, reason, detail, request })
    } catch (recordError) {
      logger.warn("could not record the step failure", {
        analysisStepId,
        error: recordError instanceof Error ? recordError.message : String(recordError),
      })
    }
    throw new StageFailedError(reason, detail, { cause: error })
  }
}

/** Q04 / AC 8: the dev override replaces `states`; nothing else changes. */
export function applyStatesOverride(criteria: Criteria, config: ScreeningConfig): Criteria {
  return config.statesOverride ? { ...criteria, states: [...config.statesOverride] } : criteria
}

export function failureReasonOf(error: unknown): AnalysisFailureReason {
  if (error instanceof HtagQuotaExceededError) return "HTAG_QUOTA_EXCEEDED"
  if (error instanceof HtagBalanceExhaustedError) return "HTAG_BALANCE_EXHAUSTED"
  return "UNEXPECTED"
}

/** `QLD2659` → `QLD`; used when a query row has no usable `state`. */
function stateFromLocPid(locPid: string): AuState | null {
  const parsed = auStateSchema.safeParse(/^[A-Z]+/.exec(locPid)?.[0])
  return parsed.success ? parsed.data : null
}

function discover(rows: readonly MarketQueryRow[]) {
  const rowsByArea = new Map<string, MarketQueryRow>()
  for (const row of rows) if (!rowsByArea.has(row.area_id)) rowsByArea.set(row.area_id, row)
  const discovered: DiscoveredSuburb[] = []
  const unparseable: string[] = []
  for (const [areaId, row] of rowsByArea) {
    const state = auStateSchema.safeParse(row.state?.toUpperCase())
    const resolvedState = state.success ? state.data : stateFromLocPid(areaId)
    if (!resolvedState || !row.area_name) {
      unparseable.push(areaId)
      continue
    }
    discovered.push({ htagAreaId: areaId, name: row.area_name, state: resolvedState })
  }
  return { discovered, rowsByArea, unparseable }
}

function seriesOf(store: SeriesStore, survivor: Survivor, metricName: string): MonthlySeries {
  return store.get(survivor.suburb.id)?.get(metricName) ?? new Map()
}

function put(store: SeriesStore, point: MetricPoint) {
  const bySuburb = store.get(point.suburbId) ?? new Map<string, Map<MonthKey, number>>()
  store.set(point.suburbId, bySuburb)
  const series = bySuburb.get(point.metricName) ?? new Map<MonthKey, number>()
  bySuburb.set(point.metricName, series)
  series.set(monthKey(point.periodEnd), point.value)
}

function supplyDetail(store: SeriesStore, survivor: Survivor): ScreenedSuburb["supply"] {
  const at = (field: string) => seriesOf(store, survivor, field).get(survivor.current) ?? null
  const somPercent = at("som_percent")
  const daysOnMarket = at("dom")
  const vacancyRate = at("vacancy_rate")
  const any = somPercent !== null || daysOnMarket !== null || vacancyRate !== null
  return { periodEnd: any ? survivor.periodEnd : null, somPercent, daysOnMarket, vacancyRate }
}

interface SeriesSpec {
  metric: HtagTrendMetric
  field: string
  points: number
  alsoStore: readonly string[]
}

interface HydrationStats {
  /** Per metric: suburbs served entirely from the cache. */
  cached: Record<string, number>
  /** Per metric: suburbs fetched (fully or incrementally). */
  fetched: Record<string, number>
}

/**
 * Cache-first hydration (D40, AC 3). For each metric and suburb, the cached
 * series is complete when it already holds the suburb's current month; those
 * suburbs are left out of the request entirely. The rest are fetched from the
 * month after their latest cached point, or from the window start if nothing
 * is cached, grouped by that start date into comma-list batches (Q13e).
 * Fetched rows are written back to the cache before they are used.
 *
 * Sequential on purpose, like the client's pagination: every row is billed.
 */
async function hydrate(
  ports: ScreeningPorts,
  client: HtagClient,
  input: {
    survivors: readonly Survivor[]
    propertyType: Criteria["propertyType"]
    store: SeriesStore
    batchSize: number
    series: readonly SeriesSpec[]
  },
): Promise<{ stats: HydrationStats; requests: Array<Record<string, unknown>> }> {
  const stats: HydrationStats = { cached: {}, fetched: {} }
  const requests: Array<Record<string, unknown>> = []
  const { survivors, propertyType, store } = input
  if (survivors.length === 0) return { stats, requests }

  const fields = input.series.flatMap((s) => [s.field, ...s.alsoStore])
  const earliest = survivors
    .map((s) => windowStart(s.periodEnd, Math.max(...input.series.map((x) => x.points))))
    .toSorted()[0]!
  const cached = await ports.readMetricPoints({
    suburbIds: survivors.map((s) => s.suburb.id),
    propertyType,
    metricNames: fields,
    fromPeriodEnd: earliest,
  })
  for (const point of cached) put(store, point)

  const byArea = new Map(survivors.map((s) => [s.areaId, s]))
  const plans: Array<{ spec: SeriesSpec; periodEndMin: string; areaIds: string[] }> = []
  for (const spec of input.series) {
    const groups = new Map<string, string[]>()
    stats.cached[spec.metric] = 0
    stats.fetched[spec.metric] = 0
    for (const s of survivors) {
      const first = shiftMonths(s.current, -(spec.points - 1))
      const months = [...seriesOf(store, s, spec.field).keys()].filter(
        (m) => m >= first && m <= s.current,
      )
      const latest = months.toSorted().at(-1)
      if (latest === s.current) {
        stats.cached[spec.metric]!++
        continue
      }
      stats.fetched[spec.metric]!++
      const from = latest ? `${shiftMonths(latest, 1)}-01` : windowStart(s.periodEnd, spec.points)
      groups.set(from, [...(groups.get(from) ?? []), s.areaId])
    }
    for (const [periodEndMin, areaIds] of groups) {
      for (let i = 0; i < areaIds.length; i += input.batchSize) {
        plans.push({ spec, periodEndMin, areaIds: areaIds.slice(i, i + input.batchSize) })
      }
    }
  }

  const run = async (index: number): Promise<void> => {
    const plan = plans[index]
    if (!plan) return
    const { spec, periodEndMin, areaIds } = plan
    requests.push({ metric: spec.metric, periodEndMin, areaIds })
    const hasBedrooms = spec.metric === "price" || spec.metric === "rent" || spec.metric === "yield"
    const { rows } = await client.trends(spec.metric, {
      level: "suburb",
      areaIds,
      propertyTypes: [propertyType],
      periodEndMin,
      ...(hasBedrooms ? { bedrooms: "All" as const } : {}),
    } as Parameters<HtagClient["trends"]>[1])
    const points: MetricPoint[] = []
    for (const row of rows as ReadonlyArray<Record<string, unknown>>) {
      const survivor = byArea.get(String(row.area_id))
      if (!survivor) continue
      const bedrooms = row.bedrooms
      if (bedrooms !== undefined && bedrooms !== null && bedrooms !== "All") continue
      for (const field of [spec.field, ...spec.alsoStore]) {
        const value = row[field]
        if (typeof value !== "number" || !Number.isFinite(value)) continue
        points.push({
          suburbId: survivor.suburb.id,
          metricName: field,
          periodEnd: String(row.period_end),
          value,
          confidence: typeof row.confidence === "string" ? row.confidence : null,
        })
      }
    }
    await ports.writeMetricPoints(propertyType, points)
    for (const point of points) put(store, point)
    return run(index + 1)
  }
  await run(0)
  return { stats, requests }
}
