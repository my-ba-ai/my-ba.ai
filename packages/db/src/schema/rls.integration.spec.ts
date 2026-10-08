import { sql } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createDatabase, createPool, type Database, type DatabasePool } from "../client"
import { loadEnvFiles, parseDbEnv } from "../env"

/**
 * RLS lives in hand-written custom migrations (D42), so a table can ship
 * without it and every query still works — which is exactly how P1-10's
 * `abs_sal_tenure` first went out (empty 0015). This makes the omission fail
 * CI instead. `suburb_metrics_ts` is the one sanctioned exception (D43).
 */
const NO_RLS_BY_DESIGN = new Set(["suburb_metrics_ts"])

let pool: DatabasePool
let db: Database

beforeAll(() => {
  loadEnvFiles()
  pool = createPool({
    connectionString: parseDbEnv().DATABASE_URL,
    max: 1,
    applicationName: "db-it-rls",
  })
  db = createDatabase(pool)
})

afterAll(async () => {
  await pool.end()
})

describe("row-level security coverage", () => {
  it("every public table has RLS enabled and forced, except the documented exception", async () => {
    const result = await db.execute<{ table: string; enabled: boolean; forced: boolean }>(sql`
      select c.relname as table, c.relrowsecurity as enabled, c.relforcerowsecurity as forced
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p')
      order by c.relname`)
    const missing = result.rows
      .filter((row) => !NO_RLS_BY_DESIGN.has(row.table))
      .filter((row) => !row.enabled || !row.forced)
      .map((row) => row.table)
    expect(result.rows.map((row) => row.table)).toContain("abs_sal_tenure")
    expect(missing).toEqual([])
  })
})
