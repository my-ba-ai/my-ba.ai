import { HTAG_BEDROOMS_ALL, HTAG_PROPERTY_TYPES } from "@my-ba/shared"
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

const propertyTypeList = sql.raw(HTAG_PROPERTY_TYPES.map((value) => `'${value}'`).join(", "))

/**
 * TimescaleDB hypertable: the per-suburb on-demand hydration cache (D40). The
 * Screener (P1-4) fetches HtAG trends for the suburbs it needs and upserts them
 * here; later tasks reuse the rows instead of paying for them again. There is
 * no scheduled national refresh (D27 superseded).
 *
 * Keyed exactly as HtAG bills: one row per area × property_type × period
 * (Q13a), per metric. `measured_at` is HtAG's `period_end`, not when we fetched
 * it, so re-fetching an unchanged period upserts onto the same row rather than
 * inventing a new series point. `bedrooms` is always `'All'` for MVP (D40).
 *
 * Long-format (metric_name, value) rather than a column per metric, because
 * HtAG's metric set is not ours to freeze. Compression segments by
 * (suburb_id, metric_name, property_type, bedrooms), so a segment is one
 * series.
 *
 * The primary key doubles as the upsert target and must contain the
 * partitioning column: Timescale rejects any unique index that omits it.
 *
 * This table has NO row-level security, unlike every other table in the schema
 * (D43). TimescaleDB does not support RLS on compressed chunks, so compression
 * and RLS cannot coexist here, and compression wins on a table that only ever
 * holds system-tenant reference data. The CHECK constraint below is what makes
 * that safe: `tenant_id` stays NOT NULL per D26, and the constraint pins every
 * row to the system tenant, so this table cannot quietly start holding
 * tenant-private data. If it ever needs to, that is a migration and a
 * conversation, not an accident.
 *
 * Changing this table's columns or key needs compression switched off around
 * the generated migration — see migrations 0010 and 0012 and the package README.
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
    /** HtAG `property_type` — see HTAG_PROPERTY_TYPES. */
    propertyType: text().notNull(),
    /** HtAG `bedrooms`. Always `'All'` for MVP (D40). */
    bedrooms: text().notNull().default(HTAG_BEDROOMS_ALL),
    metricName: text().notNull(),
    /** HtAG `period_end` (D40). The hypertable's partitioning column. */
    measuredAt: timestamp({ withTimezone: true }).notNull(),
    value: doublePrecision().notNull(),
    /** HtAG's per-row `confidence` where the endpoint returns one. Kept verbatim. */
    confidence: text(),
    /** Which upstream produced this reading — 'HTAG', 'DOMAIN', 'ABS'. */
    source: text().notNull().default("HTAG"),
  },
  (table) => [
    primaryKey({
      name: "suburb_metrics_ts_pkey",
      columns: [
        table.suburbId,
        table.propertyType,
        table.bedrooms,
        table.metricName,
        table.measuredAt,
      ],
    }),
    index("suburb_metrics_ts_measured_at_idx").on(table.measuredAt),
    index("suburb_metrics_ts_metric_name_measured_at_idx").on(table.metricName, table.measuredAt),
    index("suburb_metrics_ts_tenant_id_idx").on(table.tenantId),
    check(
      "suburb_metrics_ts_system_tenant_only",
      sql`${table.tenantId} = '00000000-0000-0000-0000-000000000000'::uuid`,
    ),
    check(
      "suburb_metrics_ts_property_type_check",
      sql`${table.propertyType} in (${propertyTypeList})`,
    ),
  ],
)

export type SuburbMetric = typeof suburbMetricsTs.$inferSelect
export type NewSuburbMetric = typeof suburbMetricsTs.$inferInsert
