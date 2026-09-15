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
