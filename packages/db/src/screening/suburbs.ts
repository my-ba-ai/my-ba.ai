import type { AuState } from "@my-ba/shared"
import { and, eq, inArray, isNull, sql } from "drizzle-orm"
import type { Database } from "../client"
import type { SalResolution } from "../abs/sal-resolver"
import { suburbs } from "../schema"
import { withSystemTenant } from "../tenant"

/** A suburb as `/markets/query` returns it (P1-4 step 3). */
export interface DiscoveredSuburb {
  /** HtAG `loc_pid`. */
  htagAreaId: string
  /** HtAG `area_name`, kept as sent (upper-case). */
  name: string
  state: AuState
}

export interface KnownSuburb {
  id: string
  htagAreaId: string
  name: string
  state: AuState
  postcode: string
  absSalCode: string | null
  absSalMatch: string | null
}

const knownColumns = {
  id: suburbs.id,
  htagAreaId: suburbs.htagAreaId,
  name: suburbs.name,
  state: suburbs.state,
  postcode: suburbs.postcode,
  absSalCode: suburbs.absSalCode,
  absSalMatch: suburbs.absSalMatch,
}

function toKnown(row: { htagAreaId: string | null } & Omit<KnownSuburb, "htagAreaId">) {
  if (!row.htagAreaId) throw new Error(`suburb ${row.id} has no htag_area_id`)
  return { ...row, htagAreaId: row.htagAreaId }
}

/** System-tenant suburbs already linked to these HtAG ids, keyed by `loc_pid`. */
export async function findSuburbsByHtagAreaIds(
  db: Database,
  htagAreaIds: readonly string[],
): Promise<Map<string, KnownSuburb>> {
  if (htagAreaIds.length === 0) return new Map()
  const rows = await withSystemTenant(db, (tx) =>
    tx
      .select(knownColumns)
      .from(suburbs)
      .where(inArray(suburbs.htagAreaId, [...htagAreaIds])),
  )
  return new Map(rows.map((row) => [row.htagAreaId as string, toKnown(row)]))
}

export interface EnsureSuburbDeps {
  /** P1-10's SAL resolver, bound to a client billing the system tenant (D72). */
  resolveSal(suburb: DiscoveredSuburb): Promise<SalResolution>
  /** HtAG `/reference/locality` postcode for a `loc_pid`; null when HtAG has none (D73). */
  lookupPostcode(htagAreaId: string): Promise<string | null>
}

export type EnsureSuburbResult =
  | { status: "existing" | "created"; suburb: KnownSuburb }
  /** No postcode could be found, so no row was written (`postcode` is NOT NULL, no placeholders). */
  | { status: "no_postcode"; htagAreaId: string }
  /** A row with the same (state, postcode, name) is already linked to a different `loc_pid`. */
  | { status: "conflict"; htagAreaId: string }

/**
 * Finds or creates the system-tenant `suburbs` row for one screened area
 * (P1-4 step 3, D73). Resolution happens before the insert, so the row is born
 * with its SAL link and a real postcode:
 *
 * 1. SAL resolution (P1-10): free name match, else the HtAG concordance.
 * 2. Postcode: the concordance's when it ran, else `/reference/locality`.
 *
 * Serialised per `loc_pid` with a transaction-scoped advisory lock, held
 * across the HtAG calls, so two overlapping screens never pay twice for the
 * same lookup: the second waits, then finds the row the first inserted. A
 * lookup that throws rolls the transaction back and nothing is written.
 *
 * A row already known by (state, postcode, name) without an HtAG id (seeded
 * before P1-4) is adopted rather than duplicated.
 */
export async function ensureSuburb(
  db: Database,
  discovered: DiscoveredSuburb,
  deps: EnsureSuburbDeps,
): Promise<EnsureSuburbResult> {
  return withSystemTenant(db, async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`suburb:${discovered.htagAreaId}`}, 0))`,
    )
    const [existing] = await tx
      .select(knownColumns)
      .from(suburbs)
      .where(eq(suburbs.htagAreaId, discovered.htagAreaId))
    if (existing) return { status: "existing", suburb: toKnown(existing) }

    const resolution = await deps.resolveSal(discovered)
    const postcode =
      resolution.salCode !== null && resolution.postcode
        ? resolution.postcode
        : await deps.lookupPostcode(discovered.htagAreaId)
    if (!postcode) return { status: "no_postcode", htagAreaId: discovered.htagAreaId }

    const [row] = await tx
      .insert(suburbs)
      .values({
        name: discovered.name,
        state: discovered.state,
        postcode,
        htagAreaId: discovered.htagAreaId,
        absSalCode: resolution.salCode,
        absSalMatch: resolution.method,
      })
      .onConflictDoUpdate({
        target: [suburbs.tenantId, suburbs.state, suburbs.postcode, suburbs.name],
        set: {
          htagAreaId: discovered.htagAreaId,
          absSalCode: resolution.salCode,
          absSalMatch: resolution.method,
          updatedAt: sql`now()`,
        },
        setWhere: isNull(suburbs.htagAreaId),
      })
      .returning(knownColumns)
    if (!row) return { status: "conflict", htagAreaId: discovered.htagAreaId }
    return { status: "created", suburb: toKnown(row) }
  })
}

/** Existing suburbs among these ids that have never had a SAL attempt (`abs_sal_match` null). */
export async function unresolvedSalAreaIds(
  db: Database,
  htagAreaIds: readonly string[],
): Promise<string[]> {
  if (htagAreaIds.length === 0) return []
  const rows = await withSystemTenant(db, (tx) =>
    tx
      .select({ htagAreaId: suburbs.htagAreaId })
      .from(suburbs)
      .where(and(inArray(suburbs.htagAreaId, [...htagAreaIds]), isNull(suburbs.absSalMatch))),
  )
  return rows.flatMap((row) => (row.htagAreaId ? [row.htagAreaId] : []))
}
