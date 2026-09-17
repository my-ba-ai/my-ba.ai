import { Logger } from "@nestjs/common"
import type { Redis } from "ioredis"
import { z } from "zod"
import { USER_ROLES } from "@my-ba/shared"

/** What the cache holds: the resolved identity, never the token. */
export const cachedIdentitySchema = z.object({
  userId: z.uuid(),
  tenantId: z.uuid(),
  email: z.email(),
  displayName: z.string().nullable(),
  role: z.enum([...USER_ROLES]),
})

export type CachedIdentity = z.infer<typeof cachedIdentitySchema>

/**
 * A cache of Clerk id -> local identity. A miss and a failure look the same to
 * the caller on purpose: the cache is an optimisation in front of Postgres, and
 * an unreachable Redis must degrade to a database lookup, not a 500 on every
 * authenticated request.
 */
export interface IdentityCache {
  get(externalAuthId: string): Promise<CachedIdentity | null>
  set(externalAuthId: string, identity: CachedIdentity, ttlMs: number): Promise<void>
  delete(externalAuthId: string): Promise<void>
}

export const IDENTITY_CACHE_KEY_PREFIX = "my-ba:auth:identity:"

/**
 * Shared by every API process, so `delete` is the cross-process invalidation
 * docs/08 asked for: there is no per-process layer in front of it to go stale.
 *
 * Trust boundary: whoever can write this key decides which tenant a Clerk id
 * resolves to. Values are parsed on read (a malformed entry is a miss), but
 * that does not help against a well-formed forged entry — Redis must be
 * authenticated and private outside local dev.
 */
export class RedisIdentityCache implements IdentityCache {
  private readonly logger = new Logger(RedisIdentityCache.name)

  constructor(private readonly redis: Redis) {}

  async get(externalAuthId: string): Promise<CachedIdentity | null> {
    try {
      const raw = await this.redis.get(this.key(externalAuthId))
      if (raw === null) return null

      const parsed = cachedIdentitySchema.safeParse(JSON.parse(raw))
      if (!parsed.success) {
        this.logger.warn(`Discarding malformed identity cache entry for ${externalAuthId}`)
        await this.delete(externalAuthId)
        return null
      }
      return parsed.data
    } catch (error: unknown) {
      this.logger.warn(`Identity cache read failed, falling back to Postgres: ${describe(error)}`)
      return null
    }
  }

  async set(externalAuthId: string, identity: CachedIdentity, ttlMs: number): Promise<void> {
    try {
      const value = JSON.stringify(cachedIdentitySchema.parse(identity))
      await this.redis.set(this.key(externalAuthId), value, "PX", ttlMs)
    } catch (error: unknown) {
      this.logger.warn(`Identity cache write failed: ${describe(error)}`)
    }
  }

  /**
   * Unlike reads and writes, a failed invalidation is not silently absorbed —
   * a caller invalidating after a role change needs to know it did not happen.
   */
  async delete(externalAuthId: string): Promise<void> {
    await this.redis.del(this.key(externalAuthId))
  }

  private key(externalAuthId: string): string {
    return `${IDENTITY_CACHE_KEY_PREFIX}${externalAuthId}`
  }
}

/** Process-local. For unit tests; not wired anywhere in the app. */
export class InMemoryIdentityCache implements IdentityCache {
  private readonly entries = new Map<string, { identity: CachedIdentity; expiresAt: number }>()

  async get(externalAuthId: string): Promise<CachedIdentity | null> {
    const entry = this.entries.get(externalAuthId)
    if (!entry || entry.expiresAt <= Date.now()) return null
    return entry.identity
  }

  async set(externalAuthId: string, identity: CachedIdentity, ttlMs: number): Promise<void> {
    this.entries.set(externalAuthId, { identity, expiresAt: Date.now() + ttlMs })
  }

  async delete(externalAuthId: string): Promise<void> {
    this.entries.delete(externalAuthId)
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
