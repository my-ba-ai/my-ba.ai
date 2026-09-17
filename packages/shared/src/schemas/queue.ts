import { z } from "zod"

/**
 * The envelope every BullMQ job payload extends.
 *
 * A job runs outside any request, so there is no guard and no `AuthContext` to
 * take a tenant from. The tenant therefore travels in the payload, set by the
 * producer from the verified `AuthContext` at enqueue time — never from
 * anything the client sent — and the processor passes it to `withTenant()`.
 * Making it part of the base schema means a job without a tenant fails to
 * parse rather than running unscoped.
 */
export const tenantJobSchema = z.object({
  tenantId: z.uuid(),
  /** Local `users.id` of whoever caused the job. Null for system-initiated work. */
  requestedBy: z.uuid().nullable(),
  requestedAt: z.iso.datetime(),
})

export type TenantJob = z.infer<typeof tenantJobSchema>

/**
 * Redis connection settings in the shape both BullMQ and ioredis accept.
 * Deliberately a plain object rather than an ioredis type, so this package
 * stays free of a Redis dependency.
 */
export interface RedisConnectionOptions {
  host: string
  port: number
  username?: string
  password?: string
  db: number
  tls?: Record<string, never>
}

/**
 * `redis://user:pass@host:6379/2` -> connection options. `rediss://` turns on
 * TLS. Throws on anything else, so a typo in `REDIS_URL` fails at boot rather
 * than at the first enqueue.
 */
export function parseRedisUrl(url: string): RedisConnectionOptions {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error("REDIS_URL is not a valid URL")
  }

  if (parsed.protocol !== "redis:" && parsed.protocol !== "rediss:") {
    throw new Error(`REDIS_URL must use redis:// or rediss://, got ${parsed.protocol}//`)
  }
  if (!parsed.hostname) {
    throw new Error("REDIS_URL has no host")
  }

  const dbPath = parsed.pathname.replace(/^\//, "")
  const db = dbPath.length > 0 ? Number(dbPath) : 0
  if (!Number.isInteger(db) || db < 0) {
    throw new Error(`REDIS_URL database index must be a non-negative integer, got "${dbPath}"`)
  }

  const options: RedisConnectionOptions = {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 6379,
    db,
  }
  if (parsed.username) options.username = decodeURIComponent(parsed.username)
  if (parsed.password) options.password = decodeURIComponent(parsed.password)
  if (parsed.protocol === "rediss:") options.tls = {}
  return options
}
