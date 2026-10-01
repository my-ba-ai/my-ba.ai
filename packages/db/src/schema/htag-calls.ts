import { HTAG_BILLING_TIERS, HTAG_COST_SOURCES, HTAG_TIERS } from "@my-ba/shared"
import { sql } from "drizzle-orm"
import {
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core"
import { purchaseTasks } from "./purchase-tasks"
import { tenants } from "./tenants"

const sqlList = (values: readonly string[]) =>
  sql.raw(values.map((value) => `'${value}'`).join(", "))
const tierList = sqlList(HTAG_TIERS)
const billingTierList = sqlList(HTAG_BILLING_TIERS)
const costSourceList = sqlList(HTAG_COST_SOURCES)

/**
 * One row per HtAG HTTP attempt — every page and every retry (P1-1, D63). The spend ledger behind D16's ~AUD $20
 * per-task budget: `AnalysisSteps.costAud` is summed from here (P1-4), and the
 * drawer's "Load supply detail" records against the task (P1-7).
 *
 * Tenant-owned, with ordinary tenant-isolation RLS (migration 0012).
 *
 * `analysis_step_id` has no foreign key yet: `analysis_steps` does not exist.
 * The migration that creates it adds the constraint — same pattern as
 * `purchase_tasks.locked_snapshot_id`.
 */
export const htagCalls = pgTable(
  "htag_calls",
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    /**
     * Null for calls made outside a task. `set null` rather than cascade: a
     * spend record outlives the task it was spent on.
     */
    taskId: uuid().references(() => purchaseTasks.id, { onDelete: "set null" }),
    /** FK added when `analysis_steps` lands (P1-4 / P1-6). */
    analysisStepId: uuid(),
    /** Path as called, e.g. `/markets/query`, `/markets/trends/price`. */
    endpoint: text().notNull(),
    /** Query params or body as sent. Never contains the API key. */
    requestJson: jsonb().$type<Record<string, unknown>>().notNull(),
    rowsReturned: integer().notNull().default(0),
    /** The endpoint's value tier (spec `x-htg-pricingTier`), not the billing band. */
    tier: text().notNull(),
    /**
     * AUD inc GST. HtAG's `X-Billing-Cost` when present; rows × configured tier
     * rate when a 2xx arrived without billing headers; 0 otherwise (D62).
     */
    costAud: numeric({ precision: 10, scale: 4 }).notNull().default("0"),
    /** Where `cost_aud` came from (D62). */
    costSource: text().notNull().default("none"),
    /** `X-Billing-Units`. Null when the response carried no billing headers. */
    billedUnits: integer(),
    /** `X-Billing-Balance`: the account balance after this request, AUD. */
    billingBalanceAud: numeric({ precision: 12, scale: 4 }),
    /** `X-Billing-Tier`: the volume band the last unit landed in (`free`, `tier1`…). */
    billingTier: text(),
    /** HTTP status. Null when no response arrived (network error / timeout). */
    statusCode: integer(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("htag_calls_tenant_id_idx").on(table.tenantId),
    index("htag_calls_task_id_idx").on(table.taskId),
    index("htag_calls_analysis_step_id_idx").on(table.analysisStepId),
    index("htag_calls_created_at_idx").on(table.createdAt),
    check("htag_calls_tier_check", sql`${table.tier} in (${tierList})`),
    check("htag_calls_rows_returned_check", sql`${table.rowsReturned} >= 0`),
    check("htag_calls_cost_aud_check", sql`${table.costAud} >= 0`),
    check("htag_calls_cost_source_check", sql`${table.costSource} in (${costSourceList})`),
    check(
      "htag_calls_billing_tier_check",
      sql`${table.billingTier} is null or ${table.billingTier} in (${billingTierList})`,
    ),
    check(
      "htag_calls_billed_units_check",
      sql`${table.billedUnits} is null or ${table.billedUnits} >= 0`,
    ),
  ],
)

export type HtagCall = typeof htagCalls.$inferSelect
export type NewHtagCall = typeof htagCalls.$inferInsert
