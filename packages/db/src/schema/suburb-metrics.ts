import { sql } from "drizzle-orm"
import {
  check,
  doublePrecision,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core"
import { SYSTEM_TENANT_ID } from "../constants"
import { suburbs } from "./suburbs"
import { tenants } from "./tenants"

/**
 * TimescaleDB hypertable. The weekly SuburbRefreshWorker (P1-2) writes every
 * suburb's metrics here and the Screener queries this table, never HTAG live
 * (D27).
 *
 * Long-format (metric_name, value) rather than a column per metric, because
 * HTAG's metric set is not ours to freeze and Q01 is still open. Costs a little
 * query ergonomics; buys not migrating the hypertable every time a metric
 * appears. Timescale's columnstore compresses this shape well — it segments by
 * (suburb_id, metric_name), so a segment is one metric's history for one
 * suburb.
 *
 * The primary key must contain the partitioning column: Timescale rejects any
 * unique index that does not include it.
 *
 * This table has NO row-level security, unlike every other table in the schema
 * (D43). TimescaleDB does not support RLS on compressed chunks, so compression
 * and RLS cannot coexist here, and compression wins on a table that only ever
 * holds system-tenant reference data. The CHECK constraint below is what makes
 * that safe: `tenant_id` stays NOT NULL per D26, and the constraint pins every
 * row to the system tenant, so this table cannot quietly start holding
 * tenant-private data. If it ever needs to, that is a migration and a
 * conversation, not an accident.
 */
export const suburbMetricsTs = pgTable(
  "suburb_metrics_ts",
  {
    suburbId: uuid()
      .notNull()
      .references(() => suburbs.id, { onDelete: "cascade" }),
    tenantId: uuid()
      .notNull()
      .default(SYSTEM_TENANT_ID)
      .references(() => tenants.id, { onDelete: "restrict" }),
    metricName: text().notNull(),
    observedAt: timestamp({ withTimezone: true }).notNull(),
    value: doublePrecision().notNull(),
    /** Which upstream produced this reading — 'HTAG', 'DOMAIN', 'ABS'. */
    source: text().notNull().default("HTAG"),
  },
  (table) => [
    primaryKey({
      name: "suburb_metrics_ts_pkey",
      columns: [table.suburbId, table.metricName, table.observedAt],
    }),
    index("suburb_metrics_ts_observed_at_idx").on(table.observedAt),
    index("suburb_metrics_ts_metric_name_observed_at_idx").on(table.metricName, table.observedAt),
    index("suburb_metrics_ts_tenant_id_idx").on(table.tenantId),
    check(
      "suburb_metrics_ts_system_tenant_only",
      sql`${table.tenantId} = '00000000-0000-0000-0000-000000000000'::uuid`,
    ),
  ],
)

export type SuburbMetric = typeof suburbMetricsTs.$inferSelect
export type NewSuburbMetric = typeof suburbMetricsTs.$inferInsert
