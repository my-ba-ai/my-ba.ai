import { Inject, Injectable, Logger } from "@nestjs/common"
import { databaseHealthResponseSchema, type DatabaseHealthResponse } from "@my-ba/shared"
import type { DatabasePool } from "@my-ba/db"
import { DATABASE_POOL } from "../database/database.module"

interface ExtensionRow {
  extname: string
  extversion: string
}

interface RoleRow {
  rolsuper: boolean
  rolbypassrls: boolean
}

/**
 * Readiness, not liveness. The existing `/api/health` answers "is the process
 * up"; this answers "can the app role reach a database that has the extensions
 * this schema is built on, without holding a privilege that would make every
 * RLS policy a no-op".
 *
 * That last part is the one worth having. RLS failing open is silent: queries
 * keep working, they just stop being scoped, and with one tenant in the
 * database nothing looks wrong until there are two.
 */
@Injectable()
export class DatabaseHealthService {
  private readonly logger = new Logger(DatabaseHealthService.name)

  constructor(@Inject(DATABASE_POOL) private readonly pool: DatabasePool) {}

  async check(): Promise<DatabaseHealthResponse> {
    const startedAt = Date.now()

    try {
      const client = await this.pool.connect()
      try {
        const extensions = await client.query<ExtensionRow>(
          "SELECT extname, extversion FROM pg_extension WHERE extname = ANY($1)",
          [["timescaledb", "vector"]],
        )
        const role = await client.query<RoleRow>(
          "SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user",
        )

        const byName = new Map(extensions.rows.map((row) => [row.extname, row.extversion]))
        const current = role.rows[0]

        return databaseHealthResponseSchema.parse({
          status: "ok",
          latencyMs: Date.now() - startedAt,
          extensions: {
            timescaledb: byName.get("timescaledb") ?? null,
            vector: byName.get("vector") ?? null,
          },
          rlsEnforced: current ? !current.rolsuper && !current.rolbypassrls : false,
          timestamp: new Date().toISOString(),
        })
      } finally {
        client.release()
      }
    } catch (error: unknown) {
      this.logger.error("Database readiness check failed", error)

      return databaseHealthResponseSchema.parse({
        status: "unreachable",
        latencyMs: Date.now() - startedAt,
        extensions: { timescaledb: null, vector: null },
        rlsEnforced: false,
        timestamp: new Date().toISOString(),
      })
    }
  }
}
