-- Tenant resolution for a verified identity that has no tenant yet (D46).
--
-- P0-3 resolves a Clerk identity to a tenant by looking it up in `users`
-- (D45: tenant-per-user, no org claim, no tenant id mirrored into Clerk).
-- That lookup runs before any tenant is known, and `users_isolation` in
-- migration 0005 is `tenant_id = current_tenant_id()`, so with no tenant set
-- the query matches nothing. The resolution step needs a way through, and the
-- shape of that way is the whole decision.
--
-- What this does NOT do, and why:
--
--   * No SECURITY DEFINER resolver function. It would work and it is the
--     conventional answer, but it puts a genuine privilege escalation in the
--     schema — the exact thing D40 exists to keep out — and every future reader
--     has to re-derive that its body is safe.
--   * No role with BYPASSRLS. Same objection, larger blast radius.
--   * No second `auth_identities` table with RLS switched off. D43 was the one
--     exception to D26 and it was expensive to justify; a second one that also
--     has to be kept in sync with `users` on every write is worse.
--
-- What it does instead: a second transaction-local setting, exactly like
-- `app.tenant_id`, and a SELECT-only policy keyed to it. The widening is one
-- row, and only for a caller that already knows the Clerk id — which it can
-- only have obtained from a signature-verified token. See withAuthLookup() in
-- src/tenant.ts.

-- STABLE for the same reason as current_tenant_id(): the value is fixed within
-- a transaction and changes between them. The `true` argument returns NULL
-- rather than raising when the setting was never set, which is the common case
-- — every request that is not resolving an identity.
CREATE OR REPLACE FUNCTION bootstrap_auth_id() RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT nullif(current_setting('app.bootstrap_auth_id', true), '')
$$;
--> statement-breakpoint

-- FOR SELECT, and that is load-bearing. Permissive policies for the same
-- command are OR'd, so this sits alongside `users_isolation` rather than
-- replacing it: reads match either policy, while INSERT and UPDATE still have
-- only `users_isolation` to satisfy. The setting therefore cannot be used to
-- write a row into someone else's tenant.
--
-- When the setting is unset, bootstrap_auth_id() is NULL and the comparison is
-- NULL, which is not TRUE — so an unscoped connection still sees no rows. The
-- failure mode stays "returns nothing", never "returns everything".
CREATE POLICY users_auth_bootstrap ON users FOR SELECT
  USING (external_auth_id = bootstrap_auth_id());
