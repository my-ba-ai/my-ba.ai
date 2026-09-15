import type { SQL } from "drizzle-orm"
import { PgDialect } from "drizzle-orm/pg-core"
import { describe, expect, it } from "vitest"
import type { Database, TenantTransaction } from "./index"
import { SYSTEM_TENANT_ID, withSystemTenant, withTenant } from "./index"

const dialect = new PgDialect()

function fakeDb(): { db: Database; executed: SQL[] } {
  const executed: SQL[] = []
  const tx = {
    execute: async (query: SQL) => {
      executed.push(query)
      return undefined
    },
  } as unknown as TenantTransaction

  const db = {
    transaction: async <T>(callback: (tx: TenantTransaction) => Promise<T>) => callback(tx),
  } as unknown as Database

  return { db, executed }
}

describe("withTenant", () => {
  it("sets app.tenant_id transaction-locally before running the callback", async () => {
    const { db, executed } = fakeDb()
    const tenantId = "11111111-2222-4333-8444-555555555555"

    await withTenant(db, tenantId, async () => "result")

    const first = executed[0]
    expect(first).toBeDefined()

    const { sql, params } = dialect.sqlToQuery(first as SQL)
    expect(sql).toContain("set_config")
    // The trailing `true` is what makes it transaction-local rather than
    // session-level. A pooled connection outlives the request; a session-level
    // GUC would leak one tenant's scope into the next request on that socket.
    expect(sql).toContain("true")
    expect(params).toEqual(["app.tenant_id", tenantId])
  })

  it("returns the callback's value", async () => {
    const { db } = fakeDb()
    await expect(
      withTenant(db, "11111111-2222-4333-8444-555555555555", async () => 42),
    ).resolves.toBe(42)
  })

  it("refuses a tenant id that is not a uuid", async () => {
    const { db, executed } = fakeDb()
    await expect(withTenant(db, "'; drop table users; --", async () => 1)).rejects.toThrow()
    expect(executed).toHaveLength(0)
  })
})

describe("withSystemTenant", () => {
  it("scopes to the reference-data tenant", async () => {
    const { db, executed } = fakeDb()

    await withSystemTenant(db, async () => undefined)

    const { params } = dialect.sqlToQuery(executed[0] as SQL)
    expect(params).toEqual(["app.tenant_id", SYSTEM_TENANT_ID])
  })
})
