import { and, eq, inArray } from "drizzle-orm"
import { randomUUID } from "node:crypto"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { createDatabase, createPool, type Database, type DatabasePool } from "../client"
import { loadEnvFiles, parseDbEnv } from "../env"
import { absSalTenure, suburbs, tenants } from "../schema"
import { withSystemTenant, withTenant } from "../tenant"
import type { AbsSalTenureRow } from "./datapack"
import {
  loadSalNameIndex,
  renterProportionsBySalCode,
  resolvePendingSuburbs,
  upsertAbsSalTenure,
} from "./repository"
import { createSalResolver, type SalToLocalityLookup } from "./sal-resolver"

/**
 * P1-10 against the migrated docker Postgres, as the app role. Test rows use
 * Census year 1901 and `TST` HtAG ids, so they never collide with a real load
 * in the dev database, and are deleted afterwards.
 */
const YEAR = 1901
const SHA = "f".repeat(64)
const tenantA = randomUUID()

let pool: DatabasePool
let db: Database

const row = (salCode: string, name: string, rented: number, occupied: number): AbsSalTenureRow => ({
  salCode,
  censusYear: YEAR,
  name,
  state: "NSW",
  rentedDwellings: rented,
  tenureNotStated: 0,
  occupiedPrivateDwellings: occupied,
  renterProportion: occupied > 0 ? rented / occupied : null,
})

const ROWS = [
  row("SAL99901", "Testville", 30, 100),
  row("SAL99902", "Twinford (North - NSW)", 10, 100),
  row("SAL99903", "Twinford (South - NSW)", 50, 100),
  row("SAL99904", "Emptyplace", 0, 0),
]

const AREA_IDS = ["TST1", "TST2", "TST3"]
const CONCURRENT_AREA_IDS = ["TST4", "TST5", "TST6"]

beforeAll(async () => {
  loadEnvFiles()
  pool = createPool({
    connectionString: parseDbEnv().DATABASE_URL,
    // Two overlapping resolve runs each hold a claim transaction.
    max: 4,
    applicationName: "db-it-abs",
  })
  db = createDatabase(pool)
  await withTenant(db, tenantA, (tx) =>
    tx.insert(tenants).values({ id: tenantA, name: `p1-10 ${tenantA}`, slug: `p1-10-${tenantA}` }),
  )
})

afterAll(async () => {
  await withSystemTenant(db, async (tx) => {
    await tx
      .delete(suburbs)
      .where(inArray(suburbs.htagAreaId, [...AREA_IDS, ...CONCURRENT_AREA_IDS]))
    await tx.delete(absSalTenure).where(eq(absSalTenure.censusYear, YEAR))
  })
  await withTenant(db, tenantA, (tx) => tx.delete(tenants).where(eq(tenants.id, tenantA)))
  await pool.end()
})

describe("abs_sal_tenure load (P1-10)", () => {
  it("writes every row once, then nothing on a re-run (AC 3)", async () => {
    expect(await upsertAbsSalTenure(db, ROWS, SHA)).toEqual({ written: ROWS.length })
    expect(await upsertAbsSalTenure(db, ROWS, SHA)).toEqual({ written: 0 })
  })

  it("rewrites only rows whose values changed", async () => {
    const changed = [
      ...ROWS.slice(0, 3),
      { ...row("SAL99904", "Emptyplace", 1, 2), renterProportion: 0.5 },
    ]
    expect(await upsertAbsSalTenure(db, changed, SHA)).toEqual({ written: 1 })
    await upsertAbsSalTenure(db, ROWS, SHA)
  })

  it("is readable by any tenant and writable only as the system tenant (RLS)", async () => {
    const seen = await withTenant(db, tenantA, (tx) =>
      tx.select().from(absSalTenure).where(eq(absSalTenure.censusYear, YEAR)),
    )
    expect(seen).toHaveLength(ROWS.length)

    await expect(
      withTenant(db, tenantA, (tx) =>
        tx
          .update(absSalTenure)
          .set({ name: "Hijacked" })
          .where(and(eq(absSalTenure.censusYear, YEAR), eq(absSalTenure.salCode, "SAL99901")))
          .returning(),
      ),
    ).resolves.toEqual([])
  })

  it("rejects a renter proportion outside [0, 1] at the database too", async () => {
    await expect(
      upsertAbsSalTenure(db, [{ ...row("SAL99905", "Bad", 5, 3), renterProportion: 5 / 3 }], SHA),
    ).rejects.toThrow()
  })

  it("renterProportionsBySalCode omits null proportions and unknown codes (AC 4)", async () => {
    const map = await renterProportionsBySalCode(db, ["SAL99901", "SAL99904", "SAL99999"], YEAR)
    expect([...map]).toEqual([["SAL99901", 0.3]])
  })
})

describe("resolvePendingSuburbs (P1-10, D72)", () => {
  it("resolves by name or HtAG, records every outcome, and a re-run costs nothing (AC 3, AC 5)", async () => {
    await withSystemTenant(db, (tx) =>
      tx.insert(suburbs).values([
        { name: "TESTVILLE", state: "NSW", postcode: "9991", htagAreaId: "TST1" },
        { name: "TWINFORD", state: "NSW", postcode: "9992", htagAreaId: "TST2" },
        { name: "NOWHERE AT ALL", state: "NSW", postcode: "9993", htagAreaId: "TST3" },
      ]),
    )
    const lookup = vi.fn<SalToLocalityLookup>(async (code) =>
      code === "SAL99903"
        ? { locPid: "TST2", postcode: "9992" }
        : { locPid: "TST-OTHER", postcode: null },
    )
    const resolver = createSalResolver({ index: await loadSalNameIndex(db, YEAR), lookup })

    const first = await resolvePendingSuburbs(db, resolver, { htagAreaIds: AREA_IDS })
    expect(first).toEqual({
      resolved: { name: 1, htag_concordance: 1, unmatched: 1 },
      lookups: 2,
      skipped: 0,
    })

    const stored = await withSystemTenant(db, (tx) =>
      tx
        .select({ id: suburbs.htagAreaId, code: suburbs.absSalCode, match: suburbs.absSalMatch })
        .from(suburbs)
        .where(inArray(suburbs.htagAreaId, AREA_IDS)),
    )
    expect(stored.toSorted((a, b) => String(a.id).localeCompare(String(b.id)))).toEqual([
      { id: "TST1", code: "SAL99901", match: "name" },
      { id: "TST2", code: "SAL99903", match: "htag_concordance" },
      { id: "TST3", code: null, match: "unmatched" },
    ])

    lookup.mockClear()
    const second = await resolvePendingSuburbs(db, resolver, { htagAreaIds: AREA_IDS })
    expect(second).toEqual({
      resolved: { name: 0, htag_concordance: 0, unmatched: 0 },
      lookups: 0,
      skipped: 0,
    })
    expect(lookup).not.toHaveBeenCalled()
  })

  it("two overlapping runs resolve each suburb once and never repeat a paid lookup", async () => {
    await withSystemTenant(db, (tx) =>
      tx.insert(suburbs).values([
        { name: "TESTVILLE", state: "NSW", postcode: "9994", htagAreaId: "TST4" },
        { name: "TWINFORD", state: "NSW", postcode: "9995", htagAreaId: "TST5" },
        { name: "NOWHERE AT ALL", state: "NSW", postcode: "9996", htagAreaId: "TST6" },
      ]),
    )
    // Slow enough that the second run reaches TWINFORD while the first holds it.
    const lookup = vi.fn<SalToLocalityLookup>(async (code) => {
      await new Promise((resolve) => setTimeout(resolve, 150))
      return code === "SAL99903"
        ? { locPid: "TST5", postcode: "9995" }
        : { locPid: "TST-OTHER", postcode: null }
    })
    const resolver = createSalResolver({ index: await loadSalNameIndex(db, YEAR), lookup })

    const runs = await Promise.all([
      resolvePendingSuburbs(db, resolver, { htagAreaIds: CONCURRENT_AREA_IDS }),
      resolvePendingSuburbs(db, resolver, { htagAreaIds: CONCURRENT_AREA_IDS }),
    ])

    const total = (key: "name" | "htag_concordance" | "unmatched") =>
      runs.reduce((sum, run) => sum + run.resolved[key], 0)
    expect({
      name: total("name"),
      htag_concordance: total("htag_concordance"),
      unmatched: total("unmatched"),
    }).toEqual({ name: 1, htag_concordance: 1, unmatched: 1 })
    // TWINFORD is ambiguous: SAL99902 misses, SAL99903 hits. Two calls, once.
    expect(lookup).toHaveBeenCalledTimes(2)
    expect(runs.reduce((sum, run) => sum + run.lookups, 0)).toBe(2)
  })

  it("a lookup that throws leaves the suburb pending, so the next run retries it", async () => {
    await withSystemTenant(db, (tx) =>
      tx
        .update(suburbs)
        .set({ absSalCode: null, absSalMatch: null })
        .where(eq(suburbs.htagAreaId, "TST5")),
    )
    const failing = createSalResolver({
      index: await loadSalNameIndex(db, YEAR),
      lookup: async () => {
        throw new Error("HtAG returned 200 with an unrecognised body")
      },
    })
    await expect(resolvePendingSuburbs(db, failing, { htagAreaIds: ["TST5"] })).rejects.toThrow(
      /unrecognised body/,
    )

    const [storedRow] = await withSystemTenant(db, (tx) =>
      tx.select({ match: suburbs.absSalMatch }).from(suburbs).where(eq(suburbs.htagAreaId, "TST5")),
    )
    expect(storedRow?.match).toBeNull()
  })

  it("the database refuses a SAL code without a match method", async () => {
    await expect(
      withSystemTenant(db, (tx) =>
        tx
          .update(suburbs)
          .set({ absSalCode: "SAL99901", absSalMatch: "unmatched" })
          .where(eq(suburbs.htagAreaId, "TST3")),
      ),
    ).rejects.toThrow()
  })
})
