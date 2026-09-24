import { type Column, getTableName, is } from "drizzle-orm"
import { toSnakeCase } from "drizzle-orm/casing"
import { getTableConfig, PgTable } from "drizzle-orm/pg-core"
import { describe, expect, it } from "vitest"
import * as schema from "./index"

const tables = Object.values(schema).filter((value) => is(value, PgTable)) as PgTable[]

/**
 * The column's name in Postgres. Columns declared without an explicit name
 * (`uuid()`) carry their JS key in `column.name` and get snake-cased only when
 * a query is built (`casing: "snake_case"` in client.ts and drizzle.config.ts),
 * so comparing `column.name` against `"tenant_id"` would never match.
 */
const sqlName = (column: Column): string =>
  column.keyAsName ? toSnakeCase(column.name) : column.name

describe("schema", () => {
  it("exports every table", () => {
    expect(tables.map(getTableName).toSorted()).toEqual([
      "htag_calls",
      "purchase_tasks",
      "suburb_metrics_ts",
      "suburbs",
      "tenants",
      "users",
    ])
  })

  /**
   * D26 is the one rule that gets more expensive every week it is not true.
   * This test is the enforcement: add a table without `tenant_id` and CI fails
   * before the migration is written, not after the data is in it.
   */
  it.each(tables.map((table) => [getTableName(table), table] as const))(
    "%s carries tenant_id",
    (name, table) => {
      const { columns } = getTableConfig(table)
      const tenantColumn = columns.find((column) => sqlName(column) === "tenant_id")

      if (name === "tenants") {
        // The tenants table *is* the tenant; its primary key plays that role.
        expect(columns.find((column) => sqlName(column) === "id")?.primary).toBe(true)
        return
      }

      expect(tenantColumn, `${name} is missing tenant_id`).toBeDefined()
      expect(tenantColumn?.notNull, `${name}.tenant_id must be NOT NULL`).toBe(true)
    },
  )

  /**
   * suburb_metrics_ts is the one table with no RLS (D43) — TimescaleDB does not
   * support row-level security on compressed chunks. This CHECK is what stands
   * in for the missing policy: it makes it impossible for the table to hold
   * anything but system-tenant reference data. Deleting it silently reopens the
   * hole the exception was granted on, so it is tested.
   */
  it("pins suburb_metrics_ts to the system tenant, since it has no RLS", () => {
    const { checks } = getTableConfig(schema.suburbMetricsTs)
    expect(checks.map((constraint) => constraint.name)).toContain(
      "suburb_metrics_ts_system_tenant_only",
    )
  })

  it("partitions suburb_metrics_ts on the column the hypertable ranges over", () => {
    const { primaryKeys, columns } = getTableConfig(schema.suburbMetricsTs)
    const pk = primaryKeys[0]

    // Timescale rejects any unique index that omits the partitioning column,
    // so this is a real constraint on the schema, not a style preference.
    expect(pk?.columns.map(sqlName)).toContain("measured_at")
    expect(columns.find((column) => sqlName(column) === "measured_at")?.notNull).toBe(true)
  })

  /**
   * D40: one row per HtAG billable row (area × property_type × period) per
   * metric. The primary key is the upsert target, so a missing column here
   * means house and unit readings silently overwrite each other.
   */
  it("keys suburb_metrics_ts exactly as D40 does", () => {
    const { primaryKeys } = getTableConfig(schema.suburbMetricsTs)
    expect(primaryKeys[0]?.columns.map(sqlName)).toEqual([
      "suburb_id",
      "property_type",
      "bedrooms",
      "metric_name",
      "measured_at",
    ])
  })

  it("constrains HtAG vocabularies to the values @my-ba/shared owns", () => {
    const metricChecks = getTableConfig(schema.suburbMetricsTs).checks.map((c) => c.name)
    const callChecks = getTableConfig(schema.htagCalls).checks.map((c) => c.name)
    expect(metricChecks).toContain("suburb_metrics_ts_property_type_check")
    expect(callChecks).toContain("htag_calls_tier_check")
  })
})
