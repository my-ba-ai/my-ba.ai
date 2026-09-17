import { drizzle } from "drizzle-orm/node-postgres"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import path from "node:path"
import { Pool, type PoolClient } from "pg"
import { MIGRATION_ADVISORY_LOCK_KEY } from "../constants"
import { loadEnvFiles } from "../env"

/**
 * Migrations are an explicit step, not something apps/api does on boot (D39).
 *
 * Every wait in here is bounded and announced. A migration runner that hangs
 * silently is worse than one that fails: you cannot tell "Postgres is down"
 * from "another deploy holds the lock" from "an open psql transaction is
 * blocking my ALTER TABLE", and all three look identical from the terminal.
 */

/** Refuse to sit on a dead socket. Postgres answers in milliseconds or not at all. */
const CONNECT_TIMEOUT_MS = 5_000

/**
 * Two, and this is load-bearing. One connection holds the advisory lock for the
 * whole run; the migrator needs a second to actually run the DDL. With max: 1
 * the migrator waits for a connection the lock holder will not release until
 * the migrator finishes — a deadlock inside a single process, which presents as
 * an indefinite hang with nothing on stdout.
 */
const POOL_MAX = 2

/** How long to wait for a competing migration before giving up. */
const LOCK_WAIT_TIMEOUT_MS = 60_000
const LOCK_POLL_INTERVAL_MS = 1_000

/**
 * Applies to waiting for a *lock*, not to statement runtime — an index build
 * can take as long as it likes. This is what turns "blocked forever behind an
 * idle transaction" into an error naming the offender.
 */
const LOCK_TIMEOUT = "10s"

function log(message: string): void {
  console.log(`[migrate] ${message}`)
}

/**
 * pg_try_advisory_lock rather than pg_advisory_lock: the blocking form waits
 * forever with nothing on stdout. This one reports who is holding it.
 */
async function acquireLock(client: PoolClient): Promise<void> {
  const deadline = Date.now() + LOCK_WAIT_TIMEOUT_MS
  let announced = false

  const poll = async (): Promise<void> => {
    const result = await client.query<{ locked: boolean }>(
      "SELECT pg_try_advisory_lock($1) AS locked",
      [MIGRATION_ADVISORY_LOCK_KEY],
    )
    if (result.rows[0]?.locked) return

    if (!announced) {
      const holder = await client.query<{ pid: number; application_name: string }>(
        `SELECT a.pid, a.application_name
         FROM pg_locks l
         JOIN pg_stat_activity a USING (pid)
         WHERE l.locktype = 'advisory' AND l.objid = $1 AND l.granted`,
        [MIGRATION_ADVISORY_LOCK_KEY],
      )
      const row = holder.rows[0]
      log(
        row
          ? `waiting for the migration lock, held by pid ${row.pid} (${row.application_name})`
          : "waiting for the migration lock",
      )
      announced = true
    }

    if (Date.now() > deadline) {
      throw new Error(
        `Timed out after ${LOCK_WAIT_TIMEOUT_MS / 1000}s waiting for the migration advisory lock. ` +
          "Another migration is still running, or a previous one is stuck. " +
          "Find it with: SELECT pid, state, query FROM pg_stat_activity WHERE application_name = 'my-ba-migrate';",
      )
    }

    await new Promise((resolve) => setTimeout(resolve, LOCK_POLL_INTERVAL_MS))
    return poll()
  }

  await poll()
}

async function appliedMigrations(client: PoolClient): Promise<Set<string>> {
  try {
    const result = await client.query<{ hash: string }>(
      "SELECT hash FROM drizzle.__drizzle_migrations",
    )
    return new Set(result.rows.map((row) => row.hash))
  } catch {
    // First run: the table does not exist yet. The migrator creates it.
    return new Set()
  }
}

async function main(): Promise<void> {
  loadEnvFiles(path.resolve(__dirname, "../.."))

  const connectionString = process.env.DATABASE_MIGRATION_URL ?? process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error(
      "DATABASE_MIGRATION_URL is not set. Copy packages/db/.env.example to packages/db/.env.",
    )
  }

  const host = (() => {
    try {
      return new URL(connectionString).host
    } catch {
      return "(unparseable connection string)"
    }
  })()

  const pool = new Pool({
    connectionString,
    max: POOL_MAX,
    application_name: "my-ba-migrate",
    connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
    // Set on every connection in the pool, including the migrator's own, which
    // a per-client SET would miss. Bounded lock waits, unbounded statement
    // runtime: an index build may take as long as it likes, but blocking behind
    // someone's idle transaction should fail and name the problem.
    options: `-c lock_timeout=${LOCK_TIMEOUT} -c statement_timeout=0`,
  })

  log(`connecting to ${host}`)

  let client: PoolClient
  try {
    client = await pool.connect()
  } catch (error: unknown) {
    await pool.end()
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(
      `Could not connect to ${host} within ${CONNECT_TIMEOUT_MS / 1000}s: ${reason}\n` +
        "Is the database up? Try: docker compose ps  (and 'pnpm db:up' if not).",
      { cause: error },
    )
  }

  try {
    await acquireLock(client)

    const before = await appliedMigrations(client)
    log(`${before.size} migration(s) already applied`)

    const db = drizzle(pool)
    await migrate(db, { migrationsFolder: path.resolve(__dirname, "../../drizzle") })

    const after = await appliedMigrations(client)
    const applied = after.size - before.size
    log(applied === 0 ? "already up to date" : `applied ${applied} migration(s)`)
  } finally {
    await client
      .query("SELECT pg_advisory_unlock($1)", [MIGRATION_ADVISORY_LOCK_KEY])
      .catch(() => undefined)
    client.release()
    await pool.end()
  }
}

main().catch((error: unknown) => {
  console.error(`\n[migrate] failed\n`)
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
