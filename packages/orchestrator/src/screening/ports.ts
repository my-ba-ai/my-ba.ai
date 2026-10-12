import type {
  AnalysisFailureReason,
  DiscoveredSuburb,
  KnownSuburb,
  MetricPoint,
  ScreeningOutcome,
  ScreeningResultInput,
} from "@my-ba/db"
import type { HtagClient } from "@my-ba/htag-client"

/**
 * Everything the screener needs from the outside world (P1-4, decided
 * 2026-10-09: logic in the orchestrator, I/O behind ports). The Postgres
 * implementation is `createPostgresScreeningPorts`; tests use in-memory
 * fakes. Mirrors `@my-ba/db`'s helpers, with the database already bound.
 */
export interface ScreeningPorts {
  /** The task's stored criteria, unparsed. Null when the task is not visible to the tenant. */
  loadCriteria(tenantId: string, taskId: string): Promise<unknown>

  /** Opens or reopens the `analysis_steps` row for this attempt; returns its id. */
  beginStep(input: {
    tenantId: string
    taskId: string
    attempt: number
    presetVersion: string | null
    weightsCustomised: boolean | null
    filtersCustomised: boolean | null
  }): Promise<string>

  /** An HtAG client whose ledger records every call against this tenant, task and step (D63). */
  htagClient(scope: { tenantId: string; taskId: string; analysisStepId: string }): HtagClient

  /**
   * Finds or creates the `suburbs` rows for screened areas (step 3, D73):
   * SAL resolution and postcode lookup before insert, serialised per
   * `loc_pid`. Reference-data HtAG calls bill the system tenant with no task.
   */
  ensureSuburbs(discovered: readonly DiscoveredSuburb[]): Promise<{
    known: Map<string, KnownSuburb>
    /** `loc_pid`s with no postcode or a conflicting row: dropped from the run. */
    dropped: string[]
  }>

  /** Hydration cache read (D40). */
  readMetricPoints(query: {
    suburbIds: readonly string[]
    propertyType: string
    metricNames: readonly string[]
    fromPeriodEnd: string
  }): Promise<MetricPoint[]>

  /** Hydration cache write (D40). */
  writeMetricPoints(propertyType: string, points: readonly MetricPoint[]): Promise<void>

  /** ABS renter proportion by SAL code (P1-10). Absent = unknown. */
  renterProportions(salCodes: readonly string[]): Promise<Map<string, number>>

  /** Writes results, sums cost from the ledger, marks the step completed. Returns the cost. */
  completeStep(input: {
    tenantId: string
    taskId: string
    analysisStepId: string
    outcome: ScreeningOutcome
    request: Record<string, unknown>
    result: Record<string, unknown>
    results: readonly ScreeningResultInput[]
  }): Promise<string>

  /** Marks the step failed with a typed reason (AC 5). */
  failStep(input: {
    tenantId: string
    analysisStepId: string
    reason: AnalysisFailureReason
    detail: string
    request?: Record<string, unknown>
  }): Promise<void>
}
