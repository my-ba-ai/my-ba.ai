import { and, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm"
import type { Database } from "../client"
import { absSalTenure, suburbs, type SalMatchMethod } from "../schema"
import { withSystemTenant, type TenantTransaction } from "../tenant"
import { ABS_TENURE_DATAPACK, type AbsSalTenureRow } from "./datapack"
import { buildSalNameIndex, type SalNameIndex } from "./sal-match"
import type { SalResolver } from "./sal-resolver"

const UPSERT_BATCH = 1_000

const excluded = (column: string) => sql.raw(`excluded.${column}`)

/**
 * Idempotent load (P1-10 AC 3). Upserts on `(sal_code, census_year)` and only
 * rewrites a row whose values changed, so a second run over the same DataPack
 * reports 0 written. One transaction: a failed load leaves the previous data.
 */
export async function upsertAbsSalTenure(
  db: Database,
  rows: readonly AbsSalTenureRow[],
  sourceSha256: string,
): Promise<{ written: number }> {
  const writeBatch = async (
    tx: TenantTransaction,
    start: number,
    written: number,
  ): Promise<number> => {
    const batch = rows.slice(start, start + UPSERT_BATCH)
    if (batch.length === 0) return written
    const result = await tx
      .insert(absSalTenure)
      .values(batch.map((row) => ({ ...row, sourceSha256 })))
      .onConflictDoUpdate({
        target: [absSalTenure.salCode, absSalTenure.censusYear],
        set: {
          name: excluded("name"),
          state: excluded("state"),
          rentedDwellings: excluded("rented_dwellings"),
          tenureNotStated: excluded("tenure_not_stated"),
          occupiedPrivateDwellings: excluded("occupied_private_dwellings"),
          renterProportion: excluded("renter_proportion"),
          sourceSha256: excluded("source_sha256"),
          loadedAt: sql`now()`,
        },
        setWhere: sql`(${absSalTenure.name}, ${absSalTenure.state}, ${absSalTenure.rentedDwellings},
          ${absSalTenure.tenureNotStated}, ${absSalTenure.occupiedPrivateDwellings},
          ${absSalTenure.renterProportion}, ${absSalTenure.sourceSha256})
          is distinct from
          (excluded.name, excluded.state, excluded.rented_dwellings, excluded.tenure_not_stated,
          excluded.occupied_private_dwellings, excluded.renter_proportion, excluded.source_sha256)`,
      })
      .returning({ salCode: absSalTenure.salCode })
    return writeBatch(tx, start + UPSERT_BATCH, written + result.length)
  }

  const written = await withSystemTenant(db, (tx) => writeBatch(tx, 0, 0))
  return { written }
}

/** The name index the resolver matches against, built from the loaded SALs. */
export async function loadSalNameIndex(
  db: Database,
  censusYear: number = ABS_TENURE_DATAPACK.censusYear,
): Promise<SalNameIndex> {
  const rows = await withSystemTenant(db, (tx) =>
    tx
      .select({ salCode: absSalTenure.salCode, name: absSalTenure.name, state: absSalTenure.state })
      .from(absSalTenure)
      .where(eq(absSalTenure.censusYear, censusYear)),
  )
  return buildSalNameIndex(rows)
}

/**
 * `renterProportion` for P1-4's `RawMetrics`. Codes with no row, or a null
 * proportion, are absent from the map: P1-8 treats the factor as missing (AC 4).
 */
export async function renterProportionsBySalCode(
  db: Database,
  salCodes: readonly string[],
  censusYear: number = ABS_TENURE_DATAPACK.censusYear,
): Promise<Map<string, number>> {
  if (salCodes.length === 0) return new Map()
  const rows = await withSystemTenant(db, (tx) =>
    tx
      .select({ salCode: absSalTenure.salCode, renterProportion: absSalTenure.renterProportion })
      .from(absSalTenure)
      .where(
        and(
          eq(absSalTenure.censusYear, censusYear),
          inArray(absSalTenure.salCode, [...salCodes]),
          isNotNull(absSalTenure.renterProportion),
        ),
      ),
  )
  return new Map(
    rows.flatMap((row) =>
      row.renterProportion === null ? [] : [[row.salCode, row.renterProportion]],
    ),
  )
}

export interface ResolveSummary {
  resolved: Record<SalMatchMethod, number>
  /** HtAG concordance calls made, all billed to the system tenant with no task. */
  lookups: number
}

/**
 * Links every system-tenant suburb that has an HtAG id but no recorded
 * attempt (`abs_sal_match` null). Each outcome is written, `unmatched`
 * included, so a second run selects nothing and makes no HtAG call (AC 3).
 *
 * `htagAreaIds` narrows the run to those suburbs (P1-4: the ones a screen
 * just returned). Suburbs are resolved one after another: the fallback is billed per call.
 * P1-4 calls the resolver directly for suburbs it is about to insert, because
 * it needs the concordance postcode before the row exists.
 */
export async function resolvePendingSuburbs(
  db: Database,
  resolver: SalResolver,
  options: { htagAreaIds?: readonly string[] } = {},
): Promise<ResolveSummary> {
  const pending = await withSystemTenant(db, (tx) =>
    tx
      .select({
        id: suburbs.id,
        htagAreaId: suburbs.htagAreaId,
        name: suburbs.name,
        state: suburbs.state,
      })
      .from(suburbs)
      .where(
        and(
          isNull(suburbs.absSalMatch),
          isNotNull(suburbs.htagAreaId),
          options.htagAreaIds ? inArray(suburbs.htagAreaId, [...options.htagAreaIds]) : undefined,
        ),
      ),
  )

  const summary: ResolveSummary = {
    resolved: { name: 0, htag_concordance: 0, unmatched: 0 },
    lookups: 0,
  }

  const resolveFrom = async (position: number): Promise<ResolveSummary> => {
    const suburb = pending[position]
    if (!suburb?.htagAreaId) return summary
    const result = await resolver.resolve({ ...suburb, htagAreaId: suburb.htagAreaId })
    await withSystemTenant(db, (tx) =>
      tx
        .update(suburbs)
        .set({ absSalCode: result.salCode, absSalMatch: result.method, updatedAt: sql`now()` })
        .where(eq(suburbs.id, suburb.id)),
    )
    summary.resolved[result.method]++
    summary.lookups += result.lookups
    return resolveFrom(position + 1)
  }
  return resolveFrom(0)
}
