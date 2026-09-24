import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core"
import { SYSTEM_TENANT_ID } from "../constants"
import { auState } from "./enums"
import { tenants } from "./tenants"

/**
 * The canonical suburb entity every external source normalises onto: HTAG uses
 * H3 geo-indexing, Domain has its own ids, RateMyAgent has neither (docs/02).
 * External ids are nullable because a suburb can be known to one source and not
 * another; (state, postcode, name) is the fallback match key and the only
 * uniqueness guarantee.
 *
 * Reference data, so it belongs to the system tenant — see SYSTEM_TENANT_ID.
 */
export const suburbs = pgTable(
  "suburbs",
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: uuid()
      .notNull()
      .default(SYSTEM_TENANT_ID)
      .references(() => tenants.id, { onDelete: "restrict" }),
    name: text().notNull(),
    state: auState().notNull(),
    postcode: text().notNull(),
    h3Index: text(),
    /**
     * HtAG `loc_pid` (e.g. `QLD2659`) — the `area_id` every HtAG endpoint takes.
     * Upsert key for suburbs discovered by a screen (P1-4).
     */
    htagAreaId: text(),
    /** ABS Suburbs and Localities code, for the Census tenure join (P1-10). */
    absSalCode: text(),
    domainId: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("suburbs_tenant_state_postcode_name_key").on(
      table.tenantId,
      table.state,
      table.postcode,
      table.name,
    ),
    uniqueIndex("suburbs_tenant_htag_area_id_key").on(table.tenantId, table.htagAreaId),
    index("suburbs_abs_sal_code_idx").on(table.absSalCode),
    index("suburbs_domain_id_idx").on(table.domainId),
    index("suburbs_h3_index_idx").on(table.h3Index),
    index("suburbs_tenant_id_idx").on(table.tenantId),
  ],
)

export type Suburb = typeof suburbs.$inferSelect
export type NewSuburb = typeof suburbs.$inferInsert
