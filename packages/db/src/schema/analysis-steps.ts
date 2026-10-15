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
import { GATE_KINDS, GATE_STATUSES, STAGE_FAILURE_REASONS } from "@my-ba/shared"
import { purchaseTasks } from "./purchase-tasks"
import { tenants } from "./tenants"
import { users } from "./users"

const sqlList = (values: readonly string[]) =>
  sql.raw(values.map((value) => `'${value}'`).join(", "))

/** Pipeline stages that write an `analysis_steps` row. P1-4 adds the first; P1-6 generalises. */
export const ANALYSIS_STAGES = ["screening"] as const
export type AnalysisStage = (typeof ANALYSIS_STAGES)[number]

/**
 * Lifecycle of one attempt. `running` is written before the first HtAG call so
 * `htag_calls.analysis_step_id` has a row to point at; a crash leaves it
 * `running`, and the re-run of the same attempt picks the row up again (D73).
 * Gate state (awaiting / approved / rejected) lives in the `gate_*` columns
 * (P1-6), not in this one: a completed attempt can still be waiting on the user.
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
export const ANALYSIS_FAILURE_REASONS = STAGE_FAILURE_REASONS
export type AnalysisFailureReason = (typeof ANALYSIS_FAILURE_REASONS)[number]

/**
 * One row per stage attempt (docs/03 `AnalysisSteps`). P1-4 writes the
 * screening rows. P1-6 (D75) reads "every node execution writes a row" as
 * "every attempt is recorded": the gate an attempt paused at, and the user's
 * answer to it, go on the same row (`gate_*`), not on rows of their own. Gate
 * values (`gate_kind`, `gate_status`) are defined in `@my-ba/shared`.
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
    /** Null unless the attempt paused at a gate (P1-6, D75). The worker mirrors it from the checkpoint. */
    gateKind: text(),
    gateStatus: text(),
    /** The gate payload as emitted through `interrupt()`; parses as the `@my-ba/shared` gate schema for `gate_kind`. */
    gatePayload: jsonb().$type<Record<string, unknown>>(),
    /** The user's answer (`GateDecision`). Set with `gate_decided_at` once approved or rejected. */
    gateDecision: jsonb().$type<Record<string, unknown>>(),
    gateDecidedAt: timestamp({ withTimezone: true }),
    gateDecidedBy: uuid().references(() => users.id, { onDelete: "set null" }),
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
    check(
      "analysis_steps_gate_kind_check",
      sql`${table.gateKind} is null or ${table.gateKind} in (${sqlList(GATE_KINDS)})`,
    ),
    check(
      "analysis_steps_gate_status_check",
      sql`${table.gateStatus} is null or ${table.gateStatus} in (${sqlList(GATE_STATUSES)})`,
    ),
    // Kind, status and payload are set together, and only on a completed attempt.
    check(
      "analysis_steps_gate_complete_check",
      sql`(${table.gateKind} is null) = (${table.gateStatus} is null) and (${table.gateKind} is null) = (${table.gatePayload} is null) and (${table.gateKind} is null or ${table.status} = 'completed')`,
    ),
    // The gate matches what the attempt produced.
    check(
      "analysis_steps_gate_outcome_check",
      sql`${table.gateKind} is null or (${table.gateKind} = 'SCREENING_TOO_BROAD') = (${table.outcome} = 'too_broad')`,
    ),
    // A decision exactly when decided. Too-broad has no approve (D42).
    check(
      "analysis_steps_gate_decision_check",
      sql`(${table.gateDecidedAt} is not null) = (${table.gateStatus} is not null and ${table.gateStatus} <> 'awaiting') and (${table.gateDecision} is not null) = (${table.gateDecidedAt} is not null)`,
    ),
    check(
      "analysis_steps_gate_too_broad_check",
      sql`${table.gateKind} is distinct from 'SCREENING_TOO_BROAD' or ${table.gateStatus} <> 'approved'`,
    ),
  ],
)

export type AnalysisStep = typeof analysisSteps.$inferSelect
export type NewAnalysisStep = typeof analysisSteps.$inferInsert
