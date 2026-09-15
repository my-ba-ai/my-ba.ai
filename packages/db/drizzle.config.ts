import { defineConfig } from "drizzle-kit"

/**
 * `src/schema` is the source of truth; `pnpm db:generate` writes the migration.
 *
 * The exceptions are the three things drizzle-kit cannot emit — `CREATE
 * EXTENSION`, TimescaleDB's `create_hypertable` plus its compression policy,
 * and the RLS policies and grants. Those go in as `--custom` migrations, which
 * keeps one journal and one migration table rather than the two-systems problem
 * D33 rejected Prisma over. See `sql/` and `scripts/bootstrap-migrations.sh`.
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_MIGRATION_URL ?? "",
  },
  casing: "snake_case",
  verbose: true,
  strict: true,
})
