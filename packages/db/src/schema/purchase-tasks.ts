import type { AnyPgColumn } from "drizzle-orm/pg-core"
import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"
import { taskStatus } from "./enums"
import { tenants } from "./tenants"
import { users } from "./users"

/**
 * The aggregate root (D02). Everything else in the domain hangs off a task id.
 *
 * `criteria` is jsonb rather than columns because Q02 is still open — if
 * criteria end up natural-language-parsed, the shape changes; if they stay
 * fixed structured fields (the leaning), the Zod schema in `@my-ba/shared`
 * becomes the contract and this column is validated on the way in and out.
 * Either way the database should not be the thing that has to migrate while
 * that question is open.
 */
export const purchaseTasks = pgTable(
  "purchase_tasks",
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    name: text().notNull(),
    status: taskStatus().notNull().default("DRAFT"),
    criteria: jsonb().$type<Record<string, unknown>>().notNull().default({}),

    /** Set on transition to CONTACT_AGENT. Non-null means immutable (D04). */
    lockedAt: timestamp({ withTimezone: true }),

    /**
     * Points at the `task_artifacts` snapshot taken at lock time (D04). No
     * foreign key yet: `task_artifacts` arrives in Phase 3, and the constraint
     * is added in the migration that creates it.
     */
    lockedSnapshotId: uuid(),

    /** D05 — cloning is the path to re-running with fresh data. */
    clonedFromTaskId: uuid().references((): AnyPgColumn => purchaseTasks.id, {
      onDelete: "set null",
    }),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("purchase_tasks_tenant_id_idx").on(table.tenantId),
    index("purchase_tasks_user_id_idx").on(table.userId),
    index("purchase_tasks_tenant_id_status_idx").on(table.tenantId, table.status),
    index("purchase_tasks_cloned_from_task_id_idx").on(table.clonedFromTaskId),
  ],
)

export type PurchaseTask = typeof purchaseTasks.$inferSelect
export type NewPurchaseTask = typeof purchaseTasks.$inferInsert
