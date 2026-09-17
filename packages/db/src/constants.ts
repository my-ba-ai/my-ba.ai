/**
 * The tenant that owns shared reference data.
 *
 * D26 says `tenant_id` on every table, full stop. But `suburbs` is canonical
 * reference data — the same ~7,000 Australian suburbs for every tenant that
 * will ever exist — so honouring D26 literally would mean either copying the
 * whole table per tenant or leaving `tenant_id` nullable, and a nullable
 * tenant column is how multi-tenant isolation bugs get in.
 *
 * Instead reference data belongs to a single well-known system tenant. The
 * column stays NOT NULL, RLS stays enabled, and the read policy on reference
 * tables is `tenant_id = current_tenant() OR tenant_id = system`. Writes still
 * require the caller to be acting as the system tenant — see `withSystemTenant`.
 * Recorded as D38.
 */
export const SYSTEM_TENANT_ID = "00000000-0000-0000-0000-000000000000"

/** Session GUC the RLS policies read. Set per transaction, never per connection. */
export const TENANT_SETTING = "app.tenant_id"

/**
 * Advisory lock key held for the duration of `pnpm db:migrate`, so two
 * deploys racing each other queue instead of interleaving DDL.
 */
export const MIGRATION_ADVISORY_LOCK_KEY = 4_170_002

/**
 * Transaction-local GUC for exactly one job: resolving a Clerk identity to its
 * tenant before any tenant is known (D46).
 *
 * Tenant-per-user resolution is a chicken-and-egg problem against D26. The
 * lookup is `where external_auth_id = $1`, but the RLS policy on `users` is
 * `tenant_id = current_tenant_id()`, and at that point in the request there is
 * no tenant yet — so the query matches nothing, always.
 *
 * The escape reuses the mechanism already in place rather than inventing one:
 * a second transaction-local setting, and a SELECT-only policy on `users` that
 * reveals the single row whose `external_auth_id` equals it. No SECURITY
 * DEFINER function, no role with BYPASSRLS, no second copy of the mapping in a
 * table with RLS switched off — all three were considered and are written up
 * in D46. Nothing in the codebase holds a privilege it would not otherwise
 * have; the policy widens by one row, for a caller who already proved it holds
 * that Clerk id by presenting a signed token.
 *
 * SELECT only, deliberately. Writes still go through `users_isolation`, so this
 * setting cannot be used to insert or update across tenants.
 */
export const AUTH_LOOKUP_SETTING = "app.bootstrap_auth_id"
