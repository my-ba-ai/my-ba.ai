import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres"
import { Pool, type PoolConfig } from "pg"
import * as schema from "./schema"

export type Database = NodePgDatabase<typeof schema>

/** Re-exported so consumers do not need a direct `pg` dependency. */
export type DatabasePool = Pool

export interface CreatePoolOptions {
  connectionString: string
  /**
   * Keep this deliberate rather than default. docs/02 lists checkpointer
   * connection exhaustion as a live architectural risk: LangGraph's
   * PostgresSaver (P0-5) wants its own pool so a queue of paused graphs cannot
   * starve the API. Build that pool with this function and a separate max.
   */
  max?: number
  applicationName?: string
}

export function createPool(options: CreatePoolOptions): Pool {
  const config: PoolConfig = {
    connectionString: options.connectionString,
    max: options.max ?? 10,
    application_name: options.applicationName ?? "my-ba",
    // Fail fast rather than hanging a request behind an exhausted pool.
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
  }
  return new Pool(config)
}

export function createDatabase(pool: Pool): Database {
  return drizzle(pool, { schema, casing: "snake_case" })
}
