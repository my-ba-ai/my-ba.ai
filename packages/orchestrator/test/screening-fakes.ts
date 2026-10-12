import type { DiscoveredSuburb, KnownSuburb, MetricPoint, ScreeningResultInput } from "@my-ba/db"
import { presetWeights, PRESET_VERSION } from "@my-ba/domain"
import {
  DEFAULT_HTAG_TIER_RATES_AUD,
  HTAG_ENDPOINT_TIERS,
  trendPath,
  type HtagClient,
  type HtagTrendMetric,
} from "@my-ba/htag-client"
import type { Criteria, HtagTier } from "@my-ba/shared"
import { randomUUID } from "node:crypto"
import type { ScreeningPorts } from "../src/screening/ports"
import { shiftMonths } from "../src/screening/periods"

/**
 * In-memory doubles for the screener (P1-4). The fake HtAG client generates
 * deterministic monthly series and bills every row at the configured tier
 * rate, so cost assertions (AC 7) run without a network or a database.
 */

export const TENANT_ID = "99999999-2222-4333-8444-555555555555"
export const TASK_ID = "11111111-2222-4333-8444-555555555555"
export const CURRENT_PERIOD = "2026-08-31"

export function validCriteria(overrides: Partial<Criteria> = {}): Criteria {
  return {
    states: ["NSW"],
    propertyType: "house",
    bedrooms: "All",
    filters: {
      typicalPrice: { min: 400_000, max: 900_000 },
      maxVacancyRatePct: 2.5,
      maxDaysOnMarket: 65,
      highConfidenceOnly: true,
    },
    profile: {
      strategy: "balanced",
      risk: "medium",
      presetVersion: PRESET_VERSION,
      weights: presetWeights("balanced", "medium"),
      weightsCustomised: false,
      filtersCustomised: false,
    },
    ...overrides,
  } as Criteria
}

export interface AreaSpec {
  areaId: string
  name: string
  state: string
  /** Monthly price points available, ending at CURRENT_PERIOD (default 60: more than any window). */
  priceHistory?: number
  /** Price growth per month (default 0.005). */
  priceDrift?: number
}

export function areas(count: number, prefix = "NSW"): AreaSpec[] {
  return Array.from({ length: count }, (_, i) => ({
    areaId: `${prefix}${1000 + i}`,
    name: `SUBURB ${i}`,
    state: prefix,
    priceDrift: 0.002 + (i % 7) * 0.001,
  }))
}

const monthEnd = (key: string) => {
  const [y, m] = key.split("-").map(Number) as [number, number]
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
}

export interface LedgerEntry {
  stepId: string | null
  endpoint: string
  tier: HtagTier
  rows: number
  costAud: number
  areaIds: string[]
}

export class FakeHtag {
  readonly ledger: LedgerEntry[] = []
  queryRows: AreaSpec[] = []
  /** Throws this from the next matching call instead of answering. */
  failWith: { endpoint: string; error: Error } | null = null

  private bill(stepId: string | null, endpoint: string, rows: number, areaIds: string[]) {
    const tier = HTAG_ENDPOINT_TIERS[endpoint]!
    const rate = DEFAULT_HTAG_TIER_RATES_AUD[tier] ?? 0
    this.ledger.push({ stepId, endpoint, tier, rows, costAud: rows * rate, areaIds })
  }

  private maybeFail(endpoint: string) {
    if (this.failWith && this.failWith.endpoint === endpoint) {
      const { error } = this.failWith
      this.failWith = null
      throw error
    }
  }

  calls(endpoint: string): LedgerEntry[] {
    return this.ledger.filter((e) => e.endpoint === endpoint)
  }

  costFor(stepId: string): number {
    return this.ledger.filter((e) => e.stepId === stepId).reduce((sum, e) => sum + e.costAud, 0)
  }

  client(stepId: string | null): HtagClient {
    return {
      queryMarkets: async (input) => {
        this.maybeFail("/markets/query")
        const limit = input.limit ?? 100
        const rows = this.queryRows.slice(0, limit).map((a) => ({
          area_id: a.areaId,
          period_end: CURRENT_PERIOD,
          property_type: "house" as const,
          level: "suburb" as const,
          area_name: a.name,
          state: a.state,
          bedrooms: "All" as const,
          typical_price: 700_000,
          rent: 650,
          confidence: "high" as const,
        }))
        this.bill(
          stepId,
          "/markets/query",
          rows.length,
          rows.map((r) => r.area_id),
        )
        return { rows, invalidRowCount: 0, truncated: rows.length === limit }
      },
      summary: async () => {
        throw new Error("summary is not used by the screener")
      },
      trends: (async (
        metric: HtagTrendMetric,
        params: { areaIds: readonly string[]; periodEndMin?: string },
      ) => {
        const path = trendPath(metric)
        this.maybeFail(path)
        const from = (params.periodEndMin ?? "1900-01-01").slice(0, 7)
        const rows = params.areaIds.flatMap((areaId) => {
          const spec = this.queryRows.find((a) => a.areaId === areaId)
          if (!spec) return []
          const history = spec.priceHistory ?? 60
          return Array.from({ length: history }, (_, k) =>
            shiftMonths(CURRENT_PERIOD.slice(0, 7), -k),
          )
            .filter((month) => month >= from)
            .map((month) => trendRow(metric, spec, month))
        })
        this.bill(stepId, path, rows.length, [...params.areaIds])
        return { rows, invalidRowCount: 0 }
      }) as HtagClient["trends"],
      salToLocality: async () => null,
      locality: async (locPid) => {
        this.bill(null, "/reference/locality", 1, [locPid])
        return {
          loc_pid: locPid,
          locality: "X",
          postcode: "2000",
          state_name: "NSW",
          suburb_key: null,
          lga_pid_ref: null,
        }
      },
    }
  }
}

function trendRow(metric: HtagTrendMetric, spec: AreaSpec, month: string): Record<string, unknown> {
  const monthsBack =
    (Number(CURRENT_PERIOD.slice(0, 4)) - Number(month.slice(0, 4))) * 12 +
    (Number(CURRENT_PERIOD.slice(5, 7)) - Number(month.slice(5, 7)))
  const drift = spec.priceDrift ?? 0.005
  // Deterministic wobble so volatility differs between suburbs.
  const wobble = 1 + 0.003 * Math.sin(monthsBack * (1 + (spec.areaId.length % 3)))
  const base = {
    area_id: spec.areaId,
    period_end: monthEnd(month),
    property_type: "house",
  }
  switch (metric) {
    case "price":
      return {
        ...base,
        bedrooms: "All",
        typical_price: 700_000 * (1 + drift) ** -monthsBack * wobble,
        sales: 10,
      }
    case "rent":
      return {
        ...base,
        bedrooms: "All",
        median_rent: 650 * (1 + drift / 2) ** -monthsBack,
        rentals: 5,
      }
    case "yield":
      return { ...base, bedrooms: "All", yield_val: 0.04 + drift }
    case "stock-on-market":
      return { ...base, som: 3, som_percent: 0.01 }
    case "days-on-market":
      return { ...base, dom: 40, discounting: -0.03 }
    case "vacancy":
      return { ...base, vacancy_rate: 0.015 }
  }
}

export interface StoredStep {
  id: string
  attempt: number
  status: "running" | "completed" | "failed"
  outcome: string | null
  failureReason: string | null
  costAud: string
  results: readonly ScreeningResultInput[]
  result: Record<string, unknown>
}

export class FakePorts implements ScreeningPorts {
  readonly htag = new FakeHtag()
  criteria: unknown = validCriteria()
  readonly suburbs = new Map<string, KnownSuburb>()
  /**
   * The hydration cache, keyed like the hypertable's primary key. A Map, not
   * an array scan: AC 7 writes ~5k points and an O(n²) fake timed out.
   */
  private readonly cache = new Map<string, MetricPoint & { propertyType: string }>()
  readonly steps = new Map<string, StoredStep>()
  renter = new Map<string, number>()
  /** loc_pids that will get no postcode. */
  noPostcode = new Set<string>()

  async loadCriteria() {
    return this.criteria
  }

  async beginStep(input: { attempt: number }) {
    const existing = [...this.steps.values()].find((s) => s.attempt === input.attempt)
    if (existing) {
      Object.assign(existing, { status: "running", outcome: null, failureReason: null })
      return existing.id
    }
    const id = randomUUID()
    this.steps.set(id, {
      id,
      attempt: input.attempt,
      status: "running",
      outcome: null,
      failureReason: null,
      costAud: "0",
      results: [],
      result: {},
    })
    return id
  }

  htagClient(scope: { analysisStepId: string }) {
    return this.htag.client(scope.analysisStepId)
  }

  async ensureSuburbs(discovered: readonly DiscoveredSuburb[]) {
    const known = new Map<string, KnownSuburb>()
    const dropped: string[] = []
    for (const d of discovered) {
      let suburb = this.suburbs.get(d.htagAreaId)
      if (!suburb) {
        if (this.noPostcode.has(d.htagAreaId)) {
          dropped.push(d.htagAreaId)
          continue
        }
        suburb = {
          id: randomUUID(),
          htagAreaId: d.htagAreaId,
          name: d.name,
          state: d.state,
          postcode: "2000",
          absSalCode: `SAL${d.htagAreaId.replace(/\D/g, "").padStart(5, "0").slice(-5)}`,
          absSalMatch: "name",
        }
        this.suburbs.set(d.htagAreaId, suburb)
      }
      known.set(d.htagAreaId, suburb)
    }
    return { known, dropped }
  }

  /** Every cached point, for assertions. */
  get points(): Array<MetricPoint & { propertyType: string }> {
    return [...this.cache.values()]
  }

  /** Drops cached points the predicate matches (e.g. "as if last month's run filled it"). */
  evictPoints(predicate: (point: MetricPoint) => boolean) {
    for (const [key, point] of this.cache) if (predicate(point)) this.cache.delete(key)
  }

  async readMetricPoints(query: {
    suburbIds: readonly string[]
    propertyType: string
    metricNames: readonly string[]
    fromPeriodEnd: string
  }) {
    const suburbIds = new Set(query.suburbIds)
    const metricNames = new Set(query.metricNames)
    return this.points.filter(
      (p) =>
        suburbIds.has(p.suburbId) &&
        p.propertyType === query.propertyType &&
        metricNames.has(p.metricName) &&
        p.periodEnd >= query.fromPeriodEnd,
    )
  }

  async writeMetricPoints(propertyType: string, points: readonly MetricPoint[]) {
    for (const point of points) {
      const key = [point.suburbId, propertyType, point.metricName, point.periodEnd].join("|")
      this.cache.set(key, { ...point, propertyType })
    }
  }

  async renterProportions(salCodes: readonly string[]) {
    return new Map([...this.renter].filter(([code]) => salCodes.includes(code)))
  }

  async completeStep(input: {
    analysisStepId: string
    outcome: string
    result: Record<string, unknown>
    results: readonly ScreeningResultInput[]
  }) {
    const step = this.steps.get(input.analysisStepId)!
    const costAud = this.htag.costFor(step.id).toFixed(4)
    Object.assign(step, {
      status: "completed",
      outcome: input.outcome,
      costAud,
      results: input.results,
      result: input.result,
    })
    return costAud
  }

  async failStep(input: { analysisStepId: string; reason: string }) {
    const step = this.steps.get(input.analysisStepId)!
    Object.assign(step, {
      status: "failed",
      failureReason: input.reason,
      costAud: this.htag.costFor(step.id).toFixed(4),
    })
  }
}
