import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core"
import { userRole } from "./enums"
import { tenants } from "./tenants"

/**
 * A local mirror of the identity provider's user, not the credential store.
 * Clerk (P0-3) owns passwords, sessions, MFA and email verification; this table
 * exists so everything else can hold a foreign key that survives the provider
 * being swapped. `externalAuthId` is the Clerk user id.
 */
export const users = pgTable(
  "users",
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    externalAuthId: text().notNull(),
    email: text().notNull(),
    role: userRole().notNull().default("investor"),
    displayName: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Global, not tenant-scoped: one Clerk identity maps to exactly one row.
    uniqueIndex("users_external_auth_id_key").on(table.externalAuthId),
    uniqueIndex("users_tenant_id_email_key").on(table.tenantId, table.email),
    index("users_tenant_id_idx").on(table.tenantId),
  ],
)

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
