import { sql } from "drizzle-orm"
import {
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"
import { analysisSteps } from "./analysis-steps"
import { purchaseTasks } from "./purchase-tasks"
import { suburbs } from "./suburbs"
import { tenants } from "./tenants"

/**
 * Latest-period supply detail for the top-N shortlist (P1-4 step 7). Null for
 * suburbs outside the top N. Rates are fractions, as HtAG returns them.
 */
export interface ScreeningSupplyDetail {
  periodEnd: string | null
  somPercent: number | null
  daysOnMarket: number | null
  vacancyRate: number | null
}

/**
 * One row per ranked suburb per screening attempt (docs/03 `ScreeningResults`).
 *
 * `score_breakdown_json` holds P1-8's `Ranked` object verbatim and is parsed
 * with `rankedSchema` on read, so the stored shape and the ranking contract
 * cannot drift apart silently. `score`, `rank`, `coverage` and
 * `insufficient_data` are copied out of it for sorting and filtering.
 *
 * `suburb_id` points at a system-tenant `suburbs` row; foreign keys are not
 * subject to RLS, so a tenant row may reference reference data.
 */
export const screeningResults = pgTable(
  "screening_results",
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    taskId: uuid()
      .notNull()
      .references(() => purchaseTasks.id, { onDelete: "cascade" }),
    analysisStepId: uuid()
      .notNull()
      .references(() => analysisSteps.id, { onDelete: "cascade" }),
    suburbId: uuid()
      .notNull()
      .references(() => suburbs.id, { onDelete: "restrict" }),
    /** HtAG `loc_pid`, denormalised: `Ranked.areaId`. */
    htagAreaId: text().notNull(),
    rank: integer().notNull(),
    /** Null when coverage is 0 (P1-8). */
    score: doublePrecision(),
    coverage: doublePrecision().notNull(),
    insufficientData: boolean().notNull(),
    /**
     * P1-8 `Ranked`. Typed loosely here so this package stays free of
     * `@my-ba/domain`; readers parse it with `rankedSchema`.
     */
    scoreBreakdownJson: jsonb().$type<Record<string, unknown>>().notNull(),
    supplyJson: jsonb().$type<ScreeningSupplyDetail>(),
    /** True for the top N that got Restricted-tier hydration. */
    shortlisted: boolean().notNull().default(false),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("screening_results_step_suburb_key").on(table.analysisStepId, table.suburbId),
    uniqueIndex("screening_results_step_rank_key").on(table.analysisStepId, table.rank),
    index("screening_results_tenant_id_idx").on(table.tenantId),
    index("screening_results_task_id_idx").on(table.taskId),
    index("screening_results_suburb_id_idx").on(table.suburbId),
    check("screening_results_rank_check", sql`${table.rank} >= 1`),
    check(
      "screening_results_coverage_check",
      sql`${table.coverage} >= 0 and ${table.coverage} <= 1.000000001`,
    ),
  ],
)

export type ScreeningResult = typeof screeningResults.$inferSelect
export type NewScreeningResult = typeof screeningResults.$inferInsert
