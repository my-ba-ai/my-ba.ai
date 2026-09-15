import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"

/**
 * The isolation boundary. One row today (mine) plus the system tenant that owns
 * reference data. Every other table points at this one.
 */
export const tenants = pgTable("tenants", {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  slug: text().notNull().unique(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
})

export type Tenant = typeof tenants.$inferSelect
export type NewTenant = typeof tenants.$inferInsert
