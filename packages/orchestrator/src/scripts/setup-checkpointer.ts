import { MIGRATION_ADVISORY_LOCK_KEY, loadEnvFiles } from "@my-ba/db"
import path from "node:path"
import { Pool } from "pg"
import { CHECKPOINT_SCHEMA, createCheckpointer } from "../checkpointer"

/**
 * Second half of `pnpm db:migrate` (D51). Drizzle owns the `langgraph` schema
 * and its grants (migration 0009); PostgresSaver owns the tables inside it and
 * tracks its own versions in `langgraph.checkpoint_migrations`. Runs as the
 * schema owner, under the same advisory lock as the Drizzle migrator.
 */

function log(message: string): void {
  console.log(`[checkpointer] ${message}`)
}

async function main(): Promise<void> {
  loadEnvFiles(path.resolve(__dirname, "../.."))

  const connectionString = process.env.DATABASE_MIGRATION_URL
  if (!connectionString) {
    throw new Error(
      "DATABASE_MIGRATION_URL is not set. Copy packages/orchestrator/.env.example to packages/orchestrator/.env.",
    )
  }

  // Two: one holds the lock, PostgresSaver.setup() borrows the other.
  const pool = new Pool({
    connectionString,
    max: 2,
    application_name: "my-ba-migrate",
    connectionTimeoutMillis: 5_000,
    options: "-c lock_timeout=10s",
  })

  const lock = await pool.connect()
  try {
    const locked = await lock.query<{ locked: boolean }>(
      "SELECT pg_try_advisory_lock($1) AS locked",
      [MIGRATION_ADVISORY_LOCK_KEY],
    )
    if (!locked.rows[0]?.locked) {
      throw new Error("another migration holds the advisory lock; retry when it finishes")
    }

    const schema = await lock.query("SELECT 1 FROM pg_namespace WHERE nspname = $1", [
      CHECKPOINT_SCHEMA,
    ])
    if (schema.rowCount === 0) {
      throw new Error(
        `schema "${CHECKPOINT_SCHEMA}" does not exist. Run the Drizzle migrations first (pnpm db:migrate runs both).`,
      )
    }

    await createCheckpointer(pool).setup()

    // Default privileges from 0009 cover tables created after it; this covers
    // anything that already existed. Idempotent.
    await lock.query(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ${CHECKPOINT_SCHEMA} TO my_ba_app`,
    )
    // The app role may read checkpoints but never rewrite the version table.
    await lock.query(
      `REVOKE INSERT, UPDATE, DELETE ON ${CHECKPOINT_SCHEMA}.checkpoint_migrations FROM my_ba_app`,
    )

    const tables = await lock.query<{ tablename: string }>(
      "SELECT tablename FROM pg_tables WHERE schemaname = $1 ORDER BY tablename",
      [CHECKPOINT_SCHEMA],
    )
    log(`ready: ${tables.rows.map((row) => row.tablename).join(", ")}`)
  } finally {
    await lock
      .query("SELECT pg_advisory_unlock($1)", [MIGRATION_ADVISORY_LOCK_KEY])
      .catch(() => undefined)
    lock.release()
    await pool.end()
  }
}

main().catch((error: unknown) => {
  console.error("\n[checkpointer] setup failed\n")
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
