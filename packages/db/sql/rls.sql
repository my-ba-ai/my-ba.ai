-- Row-level security (D26).
--
-- Two things make this real rather than decorative:
--
--   1. FORCE ROW LEVEL SECURITY. Plain ENABLE exempts the table owner, and the
--      owner is who migrations connect as. Without FORCE, every policy below
--      would be inert for anyone connected as `postgres`.
--   2. The application connects as `my_ba_app`, a NOSUPERUSER NOBYPASSRLS role
--      created by packages/db/sql/postgres-init.sql. Superusers bypass RLS
--      unconditionally, so connecting the app as `postgres` in dev would mean
--      discovering broken isolation only once a second tenant existed.
--
-- The tenant is supplied per transaction via set_config('app.tenant_id', ..,
-- true) -- see withTenant() in src/tenant.ts. Per transaction, not per
-- connection, because the pool hands the same connection to different requests.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'my_ba_app') THEN
    RAISE EXCEPTION 'role my_ba_app does not exist. Create it before migrating: see packages/db/sql/postgres-init.sql';
  END IF;
END
$$;
--> statement-breakpoint
-- STABLE, not IMMUTABLE: the value changes between transactions.
-- The `true` second argument makes current_setting return NULL instead of
-- raising when the GUC was never set, so an unscoped connection sees nothing
-- rather than erroring in a way that is easy to catch and ignore.
CREATE OR REPLACE FUNCTION current_tenant_id() RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT nullif(current_setting('app.tenant_id', true), '')::uuid
$$;
--> statement-breakpoint

--
-- Tenant-owned tables: visible only to their own tenant.
--
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenants_isolation ON tenants
  USING (id = current_tenant_id())
  WITH CHECK (id = current_tenant_id());
--> statement-breakpoint

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE users FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY users_isolation ON users
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());
--> statement-breakpoint

ALTER TABLE purchase_tasks ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE purchase_tasks FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY purchase_tasks_isolation ON purchase_tasks
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());
--> statement-breakpoint

--
-- Reference tables: every tenant reads the system tenant's rows, but writing
-- them requires acting as the system tenant (withSystemTenant). Permissive
-- policies are OR'd, so SELECT matches either policy.
--
ALTER TABLE suburbs ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE suburbs FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY suburbs_read ON suburbs FOR SELECT
  USING (
    tenant_id = current_tenant_id()
    OR tenant_id = '00000000-0000-0000-0000-000000000000'::uuid
  );
--> statement-breakpoint
CREATE POLICY suburbs_write ON suburbs FOR ALL
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());
--> statement-breakpoint

-- suburb_metrics_ts deliberately has NO row-level security (D43).
--
-- TimescaleDB: "ROW LEVEL SECURITY is not supported on compressed chunks."
-- Compression and RLS are mutually exclusive on this table, and compression
-- wins: the table holds only system-tenant reference data that every tenant
-- reads by design, so a policy protects nothing, while this will be the
-- largest table in the system.
--
-- Two things keep that from being a hole. `tenant_id` stays NOT NULL, so
-- D26's column rule is untouched. And a CHECK constraint (migration 0006)
-- pins every row to the system tenant, so the table cannot come to hold
-- tenant-private data without someone deliberately dropping that constraint.
--
-- Worth knowing regardless: per timescale/timescaledb#7830, RLS policies on a
-- hypertable are not propagated to its chunks, so RLS here would have been
-- partial even where it was accepted.

-- NOTE: suburb_embeddings was dropped in migration 0007. These statements are
-- left intact because 0005 is already applied and Drizzle hashes applied
-- migrations — editing it would break the checksum. DROP TABLE removed these
-- policies along with the table.
ALTER TABLE suburb_embeddings ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE suburb_embeddings FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY suburb_embeddings_read ON suburb_embeddings FOR SELECT
  USING (
    tenant_id = current_tenant_id()
    OR tenant_id = '00000000-0000-0000-0000-000000000000'::uuid
  );
--> statement-breakpoint
CREATE POLICY suburb_embeddings_write ON suburb_embeddings FOR ALL
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());
--> statement-breakpoint

--
-- Grants. TimescaleDB propagates hypertable privileges to chunks, so granting
-- on suburb_metrics_ts is enough; _timescaledb_internal needs nothing.
--
GRANT USAGE ON SCHEMA public TO my_ba_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO my_ba_app;
--> statement-breakpoint
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO my_ba_app;
--> statement-breakpoint
-- Applies to tables created later by this role, i.e. every future migration.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO my_ba_app;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO my_ba_app;
