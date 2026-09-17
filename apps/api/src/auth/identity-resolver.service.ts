import { randomUUID } from "node:crypto"
import { Inject, Injectable, Logger } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { eq } from "drizzle-orm"
import { DEFAULT_USER_ROLE, type UserRole } from "@my-ba/shared"
import { tenants, users, withAuthLookup, withTenant, type Database } from "@my-ba/db"
import { DATABASE } from "../database/database.tokens"
import { IDENTITY_CACHE, USER_DIRECTORY } from "./auth.tokens"
import type { IdentityCache } from "./identity-cache"
import type { UserDirectory } from "./user-directory"

export interface Identity {
  userId: string
  tenantId: string
  email: string
  displayName: string | null
  role: UserRole
}

export interface ResolvedIdentity extends Identity {
  /** True when this call created the rows rather than finding them. */
  provisioned: boolean
}

/** Postgres unique_violation. The one error in `provision` that is not a failure. */
const UNIQUE_VIOLATION = "23505"

function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false
  const candidates = [error, (error as { cause?: unknown }).cause]
  return candidates.some(
    (candidate) =>
      typeof candidate === "object" &&
      candidate !== null &&
      (candidate as { code?: unknown }).code === UNIQUE_VIOLATION,
  )
}

/** `brian@example.com` -> `brian-3f2a91cc`. Unique because the suffix is. */
function tenantSlug(email: string, tenantId: string): string {
  const local = email.split("@")[0] ?? "tenant"
  const base = local.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
  return `${base.length > 0 ? base : "tenant"}-${tenantId.replaceAll("-", "").slice(0, 8)}`
}

/**
 * Turns a verified Clerk id into the local tenant and user it owns, creating
 * them on first sight (D45).
 *
 * Tenant-per-user, resolved by lookup — not a Clerk organisation id and not a
 * tenant id mirrored into Clerk metadata. Both of those put the tenant boundary
 * in the token, which means the boundary is whatever the identity provider last
 * wrote, and a stale or missing claim routes a request into the wrong tenant or
 * none. Here the database is the only thing that decides, and the token only
 * ever says who is asking.
 */
@Injectable()
export class IdentityResolverService {
  private readonly logger = new Logger(IdentityResolverService.name)
  private readonly ttlMs: number

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(USER_DIRECTORY) private readonly directory: UserDirectory,
    @Inject(IDENTITY_CACHE) private readonly cache: IdentityCache,
    config: ConfigService,
  ) {
    // Env values arrive as strings; Redis PX needs a positive integer.
    const ttlMs = Number(config.get<string | number>("AUTH_IDENTITY_CACHE_TTL_MS", 60_000))
    if (!Number.isInteger(ttlMs) || ttlMs <= 0) {
      throw new Error("AUTH_IDENTITY_CACHE_TTL_MS must be a positive integer (milliseconds).")
    }
    this.ttlMs = ttlMs
  }

  /**
   * The cache (Redis, shared by every API process — P0-4) exists so the
   * identity lookup is not a database round trip on every authenticated
   * request; it is not a session store and must not become one. A role change
   * takes up to the TTL to apply unless `invalidate` is called, and because
   * the cache is shared, one call invalidates it for every process.
   *
   * If Redis is down the cache reports a miss and this falls through to
   * Postgres: slower, never wrong.
   */
  async resolve(externalAuthId: string): Promise<ResolvedIdentity> {
    const cached = await this.cache.get(externalAuthId)
    if (cached) {
      return { ...cached, provisioned: false }
    }

    const found = await this.lookup(externalAuthId)
    if (found) {
      await this.cache.set(externalAuthId, found, this.ttlMs)
      return { ...found, provisioned: false }
    }

    const created = await this.provision(externalAuthId)
    await this.cache.set(externalAuthId, created.identity, this.ttlMs)
    return { ...created.identity, provisioned: created.provisioned }
  }

  async invalidate(externalAuthId: string): Promise<void> {
    await this.cache.delete(externalAuthId)
  }

  /**
   * The one query in the system that runs outside a tenant scope, and the only
   * one permitted to (D46). It reads a single row through the bootstrap policy
   * and returns the tenant that every subsequent query will be scoped by.
   */
  private async lookup(externalAuthId: string): Promise<Identity | null> {
    return withAuthLookup(this.db, externalAuthId, async (tx) => {
      const rows = await tx
        .select({
          userId: users.id,
          tenantId: users.tenantId,
          email: users.email,
          displayName: users.displayName,
          role: users.role,
        })
        .from(users)
        .where(eq(users.externalAuthId, externalAuthId))
        .limit(1)

      return rows[0] ?? null
    })
  }

  /**
   * No privilege needed: the tenant uuid is generated here, `withTenant` sets it
   * as the current tenant, and both inserts then satisfy their own WITH CHECK.
   * The tenant row is created by the transaction that is already scoped to it.
   *
   * Both inserts share one transaction, so a losing race leaves nothing behind
   * — the orphan tenant rolls back with the user insert that collided.
   */
  private async provision(
    externalAuthId: string,
  ): Promise<{ identity: Identity; provisioned: boolean }> {
    const profile = await this.directory.fetch(externalAuthId)
    const tenantId = randomUUID()

    try {
      const identity = await withTenant(this.db, tenantId, async (tx) => {
        await tx.insert(tenants).values({
          id: tenantId,
          name: profile.displayName ?? profile.email,
          slug: tenantSlug(profile.email, tenantId),
        })

        const inserted = await tx
          .insert(users)
          .values({
            tenantId,
            externalAuthId,
            email: profile.email,
            displayName: profile.displayName,
            role: DEFAULT_USER_ROLE,
          })
          .returning({
            userId: users.id,
            tenantId: users.tenantId,
            email: users.email,
            displayName: users.displayName,
            role: users.role,
          })

        const row = inserted[0]
        if (!row) throw new Error("Insert into users returned no row")
        return row
      })

      this.logger.log(`Provisioned tenant ${tenantId} for identity ${externalAuthId}`)
      return { identity, provisioned: true }
    } catch (error: unknown) {
      if (!isUniqueViolation(error)) throw error

      // Two first requests arrived together. `users_external_auth_id_key` is
      // global, so exactly one of them won; read back whatever it wrote.
      const existing = await this.lookup(externalAuthId)
      if (!existing) throw error
      return { identity: existing, provisioned: false }
    }
  }
}
