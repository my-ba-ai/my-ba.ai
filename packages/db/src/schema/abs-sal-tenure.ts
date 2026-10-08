import { sql } from "drizzle-orm"
import {
  check,
  doublePrecision,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core"
import { SYSTEM_TENANT_ID } from "../constants"
import { auState } from "./enums"
import { tenants } from "./tenants"

/**
 * ABS Census tenure per Suburb and Locality (SAL) — P1-10, D72. Static
 * reference data (D28), loaded once per Census by `pnpm abs:load` from the
 * pinned DataPack (`src/abs/datapack.ts`); there is no scheduled refresh.
 *
 * Owned by the system tenant like `suburbs`: every tenant reads it, only
 * `withSystemTenant` writes it (RLS in `sql/abs-sal-tenure-rls.sql`). The
 * CHECK pins rows to the system tenant as well, so the table cannot start
 * holding tenant-private data by accident.
 *
 * Raw counts are kept next to the derived proportion, so the D72 definition
 * can change without a re-download.
 */
export const absSalTenure = pgTable(
  "abs_sal_tenure",
  {
    /** ASGS 2021 SAL code, `SAL13714`. Joined from `suburbs.abs_sal_code`. */
    salCode: text().notNull(),
    censusYear: integer().notNull(),
    tenantId: uuid()
      .notNull()
      .default(SYSTEM_TENANT_ID)
      .references(() => tenants.id, { onDelete: "restrict" }),
    /** ABS name verbatim, disambiguator included: `Paddington (NSW)`. */
    name: text().notNull(),
    state: auState().notNull(),
    /** G37 `R_Tot_Total`. */
    rentedDwellings: integer().notNull(),
    /** G37 `Ten_type_NS_Total`. */
    tenureNotStated: integer().notNull(),
    /** G37 `Total_Total`: occupied private dwellings. */
    occupiedPrivateDwellings: integer().notNull(),
    /**
     * D72: rented ÷ (occupied − not stated), 0–1. Null for a zero denominator
     * or an ABS-perturbed fraction outside [0, 1].
     */
    renterProportion: doublePrecision(),
    /** SHA-256 of the DataPack the row came from. */
    sourceSha256: text().notNull(),
    loadedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ name: "abs_sal_tenure_pkey", columns: [table.salCode, table.censusYear] }),
    index("abs_sal_tenure_tenant_id_idx").on(table.tenantId),
    check(
      "abs_sal_tenure_system_tenant_only",
      sql`${table.tenantId} = '00000000-0000-0000-0000-000000000000'::uuid`,
    ),
    check("abs_sal_tenure_sal_code_check", sql`${table.salCode} ~ '^SAL[0-9]{5}$'`),
    check(
      "abs_sal_tenure_counts_check",
      sql`${table.rentedDwellings} >= 0 and ${table.tenureNotStated} >= 0 and ${table.occupiedPrivateDwellings} >= 0`,
    ),
    check(
      "abs_sal_tenure_renter_proportion_check",
      sql`${table.renterProportion} is null or (${table.renterProportion} >= 0 and ${table.renterProportion} <= 1)`,
    ),
  ],
)

export type AbsSalTenure = typeof absSalTenure.$inferSelect
export type NewAbsSalTenure = typeof absSalTenure.$inferInsert
