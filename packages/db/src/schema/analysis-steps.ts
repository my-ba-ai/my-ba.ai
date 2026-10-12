import { sql } from "drizzle-orm"
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"
import { purchaseTasks } from "./purchase-tasks"
import { tenants } from "./tenants"

const sqlList = (values: readonly string[]) =>
  sql.raw(values.map((value) => `'${value}'`).join(", "))

/** Pipeline stages that write an `analysis_steps` row. P1-4 adds the first; P1-6 generalises. */
export const ANALYSIS_STAGES = ["screening"] as const
export type AnalysisStage = (typeof ANALYSIS_STAGES)[number]

/**
 * Lifecycle of one attempt. `running` is written before the first HtAG call so
 * `htag_calls.analysis_step_id` has a row to point at; a crash leaves it
 * `running`, and the re-run of the same attempt picks the row up again (D73).
 * Gate state (awaiting / approved / rejected) is P1-6's, not this column's.
 */
export const ANALYSIS_STEP_STATUSES = ["running", "completed", "failed"] as const
export type AnalysisStepStatus = (typeof ANALYSIS_STEP_STATUSES)[number]

/** What a completed screening attempt produced. */
export const SCREENING_OUTCOMES = ["too_broad", "ranked"] as const
export type ScreeningOutcome = (typeof SCREENING_OUTCOMES)[number]

/**
 * Typed failure reasons (P1-4 AC 5). The task stays resumable: fixing the
 * cause (top up the balance, wait for the quota reset) and re-running the
 * stage retries the same attempt.
 */
export const ANALYSIS_FAILURE_REASONS = [
  "HTAG_QUOTA_EXCEEDED",
  "HTAG_BALANCE_EXHAUSTED",
  "INVALID_CRITERIA",
  /** Anything else (HtAG 5xx after retries, network, a bug). Retryable; detail says what. */
  "UNEXPECTED",
] as const
export type AnalysisFailureReason = (typeof ANALYSIS_FAILURE_REASONS)[number]

/**
 * One row per stage attempt (docs/03 `AnalysisSteps`). P1-4 writes the
 * screening rows; P1-6 generalises "every node writes a row" and owns status
 * sync with the task.
 *
 * `attempt` counts loops in the same LangGraph thread: a too-broad gate or a
 * Reject & Adjust sends the graph back to screen with fresh criteria, and each
 * pass is a new attempt with its own spend.
 *
 * `cost_aud` is summed from `htag_calls` for this step (P1-4 AC 4), never
 * estimated. Calls made for reference data on the way (SAL resolution,
 * locality postcodes) are billed to the system tenant with no step (D73).
 */
export const analysisSteps = pgTable(
  "analysis_steps",
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    taskId: uuid()
      .notNull()
      .references(() => purchaseTasks.id, { onDelete: "cascade" }),
    stage: text().notNull(),
    attempt: integer().notNull(),
    status: text().notNull().default("running"),
    /** Null while running or failed. */
    outcome: text(),
    failureReason: text(),
    /** Error message for a failure, for the operator. Never shown to the user verbatim. */
    failureDetail: text(),
    /** What was asked: the compiled query body, trend batches, config. */
    requestJson: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    /** What came back, summarised: row counts, cache hits, coverage, disabled factors. */
    resultJson: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    /** AUD inc GST, summed from `htag_calls` (D62). */
    costAud: numeric({ precision: 10, scale: 4 }).notNull().default("0"),
    /** `PRESET_VERSION` the task's profile was prefilled from (D17). */
    presetVersion: text(),
    /** The profile's customised flags at run time (D18, D19), for the approval summary. */
    weightsCustomised: boolean(),
    filtersCustomised: boolean(),
    startedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("analysis_steps_task_stage_attempt_key").on(
      table.taskId,
      table.stage,
      table.attempt,
    ),
    index("analysis_steps_tenant_id_idx").on(table.tenantId),
    check("analysis_steps_stage_check", sql`${table.stage} in (${sqlList(ANALYSIS_STAGES)})`),
    check("analysis_steps_attempt_check", sql`${table.attempt} >= 1`),
    check(
      "analysis_steps_status_check",
      sql`${table.status} in (${sqlList(ANALYSIS_STEP_STATUSES)})`,
    ),
    check(
      "analysis_steps_outcome_check",
      sql`${table.outcome} is null or ${table.outcome} in (${sqlList(SCREENING_OUTCOMES)})`,
    ),
    check(
      "analysis_steps_failure_reason_check",
      sql`${table.failureReason} is null or ${table.failureReason} in (${sqlList(ANALYSIS_FAILURE_REASONS)})`,
    ),
    // An outcome exactly when completed; a failure reason only when failed.
    check(
      "analysis_steps_outcome_status_check",
      sql`(${table.outcome} is not null) = (${table.status} = 'completed')`,
    ),
    check(
      "analysis_steps_failure_status_check",
      sql`${table.failureReason} is null or ${table.status} = 'failed'`,
    ),
    check("analysis_steps_cost_aud_check", sql`${table.costAud} >= 0`),
  ],
)

export type AnalysisStep = typeof analysisSteps.$inferSelect
export type NewAnalysisStep = typeof analysisSteps.$inferInsert
