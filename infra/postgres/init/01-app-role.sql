-- Runs once, on first container boot, as the superuser.
--
-- Why this exists: Postgres row-level security is bypassed by superusers and by
-- any role with BYPASSRLS, no exceptions. If the app connected as `postgres`,
-- every policy written in the migrations would silently do nothing and we would
-- not find out until a second tenant existed. So dev gets the same two-role
-- split as production: `postgres` owns the schema and runs migrations,
-- `my_ba_app` runs the application and is subject to every policy.
--
-- Role creation is environment setup, not schema, so it lives here rather than
-- in a migration. The GRANTs live in the RLS migration, where the tables exist.
\set app_password `echo "$APP_DB_PASSWORD"`

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'my_ba_app') THEN
    CREATE ROLE my_ba_app LOGIN;
  END IF;
END
$$;

ALTER ROLE my_ba_app WITH PASSWORD :'app_password';

-- Belt and braces: make it impossible for this role to acquire RLS bypass.
ALTER ROLE my_ba_app NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
