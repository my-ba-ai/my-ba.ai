import { eq, sql } from "drizzle-orm"
import { randomUUID } from "node:crypto"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createDatabase, createPool, type Database, type DatabasePool } from "../client"
import { loadEnvFiles, parseDbEnv } from "../env"
import { withSystemTenant, withTenant } from "../tenant"
import { htagCalls, suburbMetricsTs, suburbs, tenants } from "./index"

/**
 * P1-0 acceptance criteria 2–4, against the migrated docker Postgres, as the
 * app role — so RLS, grants and Timescale constraints apply exactly as in dev.
 * AC 1 (applies from scratch) is the CI `Migrate` step itself.
 */

let pool: DatabasePool
let db: Database

const tenantA = randomUUID()
const tenantB = randomUUID()
const areaId = `TEST${Date.now()}`
let suburbId: string

beforeAll(async () => {
  loadEnvFiles()
  const env = parseDbEnv()
  pool = createPool({ connectionString: env.DATABASE_URL, max: 2, applicationName: "db-it" })
  db = createDatabase(pool)

  await Promise.all(
    [tenantA, tenantB].map((id) =>
      withTenant(db, id, (tx) =>
        tx.insert(tenants).values({ id, name: `p1-0 ${id}`, slug: `p1-0-${id}` }),
      ),
    ),
  )

  const [row] = await withSystemTenant(db, (tx) =>
    tx
      .insert(suburbs)
      .values({ name: "Testville", state: "QLD", postcode: "4999", htagAreaId: areaId })
      .returning({ id: suburbs.id }),
  )
  if (!row) throw new Error("suburb insert returned nothing")
  suburbId = row.id
})

afterAll(async () => {
  // Cascades to suburb_metrics_ts rows and htag_calls rows respectively.
  await withSystemTenant(db, (tx) => tx.delete(suburbs).where(eq(suburbs.id, suburbId)))
  await Promise.all(
    [tenantA, tenantB].map((id) =>
      withTenant(db, id, (tx) => tx.delete(tenants).where(eq(tenants.id, id))),
    ),
  )
  await pool.end()
})

describe("suburb_metrics_ts (AC 2, 3)", () => {
  it("is a hypertable partitioned on measured_at, with the D40 key as primary key", async () => {
    const dims = await pool.query<{ column_name: string }>(
      `select column_name from timescaledb_information.dimensions
        where hypertable_schema = 'public' and hypertable_name = 'suburb_metrics_ts'`,
    )
    expect(dims.rows.map((r) => r.column_name)).toEqual(["measured_at"])

    const pk = await pool.query<{ column_name: string }>(
      `select a.attname as column_name
         from pg_index i
         join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
        where i.indrelid = 'public.suburb_metrics_ts'::regclass and i.indisprimary
        order by array_position(i.indkey, a.attnum)`,
    )
    expect(pk.rows.map((r) => r.column_name)).toEqual([
      "suburb_id",
      "property_type",
      "bedrooms",
      "metric_name",
      "measured_at",
    ])
  })

  it("keeps compression on, segmented per series", async () => {
    const settings = await pool.query<{ segmentby: string | null }>(
      `select segmentby from timescaledb_information.hypertable_compression_settings
        where hypertable = 'suburb_metrics_ts'::regclass`,
    )
    const segmentby = (settings.rows[0]?.segmentby ?? "").replaceAll(" ", "").split(",")
    expect(segmentby.toSorted()).toEqual(
      ["bedrooms", "metric_name", "property_type", "suburb_id"].toSorted(),
    )
  })

  it("upserting the same (suburb, property_type, bedrooms, metric, measured_at) twice leaves one row", async () => {
    const measuredAt = new Date("2026-06-30T00:00:00Z")
    const upsert = (value: number) =>
      withSystemTenant(db, (tx) =>
        tx
          .insert(suburbMetricsTs)
          .values({
            suburbId,
            propertyType: "house",
            metricName: "typical_price",
            measuredAt,
            value,
          })
          .onConflictDoUpdate({
            target: [
              suburbMetricsTs.suburbId,
              suburbMetricsTs.propertyType,
              suburbMetricsTs.bedrooms,
              suburbMetricsTs.metricName,
              suburbMetricsTs.measuredAt,
            ],
            set: { value: sql`excluded.value` },
          }),
      )

    await upsert(750_000)
    await upsert(760_000)
    // Same period, other property type: a separate billable row (Q13a), so a separate row here.
    await withSystemTenant(db, (tx) =>
      tx.insert(suburbMetricsTs).values({
        suburbId,
        propertyType: "unit",
        metricName: "typical_price",
        measuredAt,
        value: 480_000,
      }),
    )

    const rows = await withSystemTenant(db, (tx) =>
      tx.select().from(suburbMetricsTs).where(eq(suburbMetricsTs.suburbId, suburbId)),
    )
    expect(rows).toHaveLength(2)
    const house = rows.find((r) => r.propertyType === "house")
    expect(house?.value).toBe(760_000)
    expect(house?.bedrooms).toBe("All")
    expect(house?.source).toBe("HTAG")
  })

  it("rejects a property_type HtAG does not have", async () => {
    await expect(
      withSystemTenant(db, (tx) =>
        tx.insert(suburbMetricsTs).values({
          suburbId,
          propertyType: "townhouse",
          metricName: "typical_price",
          measuredAt: new Date("2026-06-30T00:00:00Z"),
          value: 1,
        }),
      ),
    ).rejects.toThrow()
  })
})

describe("suburbs.htag_area_id", () => {
  it("is unique per tenant, so a screen can upsert suburbs by loc_pid", async () => {
    await expect(
      withSystemTenant(db, (tx) =>
        tx
          .insert(suburbs)
          .values({ name: "Other", state: "QLD", postcode: "4998", htagAreaId: areaId }),
      ),
    ).rejects.toThrow()
  })
})

const htagCall = (tenantId: string) => ({
  tenantId,
  endpoint: "/markets/query",
  requestJson: { limit: 100 },
  rowsReturned: 37,
  tier: "reference",
  costAud: "0.0740",
  statusCode: 200,
})

describe("htag_calls RLS (AC 4)", () => {
  it("is visible to its own tenant only", async () => {
    await withTenant(db, tenantA, (tx) => tx.insert(htagCalls).values(htagCall(tenantA)))

    const own = await withTenant(db, tenantA, (tx) => tx.select().from(htagCalls))
    const other = await withTenant(db, tenantB, (tx) => tx.select().from(htagCalls))
    const unscoped = await db.select().from(htagCalls)

    expect(own).toHaveLength(1)
    expect(own[0]?.costAud).toBe("0.0740")
    expect(other).toHaveLength(0)
    expect(unscoped).toHaveLength(0)
  })

  it("refuses a write stamped with another tenant's id", async () => {
    await expect(
      withTenant(db, tenantA, (tx) => tx.insert(htagCalls).values(htagCall(tenantB))),
    ).rejects.toThrow()
  })

  it("rejects an unknown tier", async () => {
    await expect(
      withTenant(db, tenantA, (tx) =>
        tx.insert(htagCalls).values({ ...htagCall(tenantA), tier: "gold" }),
      ),
    ).rejects.toThrow()
  })
})
