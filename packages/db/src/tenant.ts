import { sql } from "drizzle-orm"
import { z } from "zod"
import type { Database } from "./client"
import { AUTH_LOOKUP_SETTING, SYSTEM_TENANT_ID, TENANT_SETTING } from "./constants"

/** The transaction handle handed to a tenant-scoped callback. */
export type TenantTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0]

const tenantIdSchema = z.uuid()

/**
 * Runs `fn` inside a transaction with `app.tenant_id` set, which is what every
 * RLS policy reads. Outside this wrapper the app role sees an empty database —
 * that is the design, not a bug: a query that forgets its tenant returns
 * nothing instead of returning everything.
 *
 * The setting is transaction-local (`set_config(.., true)`), never session
 * level. A pooled connection is handed to whichever request asks next, so a
 * session-level GUC would leak one tenant's scope into another's query.
 */
export async function withTenant<T>(
  db: Database,
  tenantId: string,
  fn: (tx: TenantTransaction) => Promise<T>,
): Promise<T> {
  const id = tenantIdSchema.parse(tenantId)
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config(${TENANT_SETTING}, ${id}, true)`)
    return fn(tx)
  })
}

/**
 * Scoped to the tenant that owns reference data (D38). This is what the weekly
 * SuburbRefreshWorker and the ABS census ETL run as — writes to `suburbs`
 * require it. Anything serving a user request should be using `withTenant`
 * instead.
 */
export async function withSystemTenant<T>(
  db: Database,
  fn: (tx: TenantTransaction) => Promise<T>,
): Promise<T> {
  return withTenant(db, SYSTEM_TENANT_ID, fn)
}

/** Clerk user ids look like `user_2abc…`; the bound is a sanity check, not a format claim. */
const externalAuthIdSchema = z.string().min(1).max(255)

/**
 * Runs `fn` in a transaction that can see one `users` row: the one whose
 * `external_auth_id` matches. This is the only way to cross from a verified
 * token to a tenant id, because until that row is read there is no tenant to
 * scope the query with (D46).
 *
 * Use it for exactly that and nothing else. The moment the tenant is known,
 * every subsequent query belongs inside `withTenant`. The policy this relies on
 * is `FOR SELECT` only, so a write attempted in here still has to satisfy
 * `users_isolation` and will fail — that is intended, not a limitation to work
 * around.
 *
 * Provisioning a brand new identity does not need this wrapper at all: generate
 * the tenant uuid application-side, open `withTenant` on it, and the inserts
 * satisfy the existing `WITH CHECK` on both tables.
 */
export async function withAuthLookup<T>(
  db: Database,
  externalAuthId: string,
  fn: (tx: TenantTransaction) => Promise<T>,
): Promise<T> {
  const id = externalAuthIdSchema.parse(externalAuthId)
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config(${AUTH_LOOKUP_SETTING}, ${id}, true)`)
    return fn(tx)
  })
}
