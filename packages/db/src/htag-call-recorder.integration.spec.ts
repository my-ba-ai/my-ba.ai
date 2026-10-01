import type { HtagCallRecord } from "@my-ba/shared"
import { eq } from "drizzle-orm"
import { randomUUID } from "node:crypto"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createDatabase, createPool, type Database, type DatabasePool } from "./client"
import { loadEnvFiles, parseDbEnv } from "./env"
import { createHtagCallRecorder } from "./htag-call-recorder"
import { htagCalls, tenants } from "./schema"
import { withTenant } from "./tenant"

/**
 * P1-1 AC 9 (database half), against the migrated docker Postgres as the app
 * role. The client half — a recorder that throws is logged, data still
 * returned — is a unit test in @my-ba/htag-client.
 */

let pool: DatabasePool
let db: Database

const tenantA = randomUUID()
const tenantB = randomUUID()

const billed: HtagCallRecord = {
  endpoint: "/markets/trends/days-on-market",
  request: { level: "suburb", area_id: "ACT101", property_type: "house", limit: 3, offset: 0 },
  tier: "restricted",
  statusCode: 200,
  rowsReturned: 3,
  costAud: "0.666",
  costSource: "header",
  billedUnits: 3,
  billingBalanceAud: "24.334",
  billingTier: "tier1",
}

const rowsFor = (tenantId: string) => withTenant(db, tenantId, (tx) => tx.select().from(htagCalls))

beforeAll(async () => {
  loadEnvFiles()
  const env = parseDbEnv()
  // Three connections: the rollback case holds one open while the recorder takes another.
  pool = createPool({
    connectionString: env.DATABASE_URL,
    max: 3,
    applicationName: "db-it-recorder",
  })
  db = createDatabase(pool)
  await Promise.all(
    [tenantA, tenantB].map((id) =>
      withTenant(db, id, (tx) =>
        tx.insert(tenants).values({ id, name: `p1-1 ${id}`, slug: `p1-1-${id}` }),
      ),
    ),
  )
})

afterAll(async () => {
  // Cascades to htag_calls.
  await Promise.all(
    [tenantA, tenantB].map((id) =>
      withTenant(db, id, (tx) => tx.delete(tenants).where(eq(tenants.id, id))),
    ),
  )
  await pool.end()
})

describe("createHtagCallRecorder", () => {
  it("writes a tenant-scoped row with the billing header fields (D62)", async () => {
    await createHtagCallRecorder(db, { tenantId: tenantA }).record(billed)

    const own = await rowsFor(tenantA)
    expect(own).toHaveLength(1)
    expect(own[0]).toMatchObject({
      tenantId: tenantA,
      taskId: null,
      analysisStepId: null,
      endpoint: billed.endpoint,
      rowsReturned: 3,
      tier: "restricted",
      costAud: "0.6660",
      costSource: "header",
      billedUnits: 3,
      billingBalanceAud: "24.3340",
      billingTier: "tier1",
      statusCode: 200,
    })
    expect(await rowsFor(tenantB)).toHaveLength(0)
  })

  it("keeps the spend record when the caller's transaction rolls back (D63)", async () => {
    const before = (await rowsFor(tenantB)).length
    const recorder = createHtagCallRecorder(db, { tenantId: tenantB })

    await expect(
      withTenant(db, tenantB, async () => {
        await recorder.record({ ...billed, costAud: "0.222", rowsReturned: 1, billedUnits: 1 })
        throw new Error("caller rolled back")
      }),
    ).rejects.toThrow("caller rolled back")

    expect(await rowsFor(tenantB)).toHaveLength(before + 1)
  })

  it("records a network error with no status and nothing charged", async () => {
    await createHtagCallRecorder(db, { tenantId: tenantA }).record({
      ...billed,
      statusCode: null,
      rowsReturned: 0,
      costAud: "0",
      costSource: "none",
      billedUnits: null,
      billingBalanceAud: null,
      billingTier: null,
    })
    const rows = await rowsFor(tenantA)
    expect(rows.some((r) => r.statusCode === null && r.costSource === "none")).toBe(true)
  })

  it("rejects a record that fails the shared schema before touching the database", async () => {
    const recorder = createHtagCallRecorder(db, { tenantId: tenantA })
    await expect(recorder.record({ ...billed, costAud: "-1" })).rejects.toThrow()
  })

  it("refuses a scope that is not a uuid", () => {
    expect(() => createHtagCallRecorder(db, { tenantId: "not-a-uuid" })).toThrow()
  })
})
