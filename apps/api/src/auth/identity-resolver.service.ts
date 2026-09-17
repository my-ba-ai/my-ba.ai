import { randomUUID } from "node:crypto"
import { Inject, Injectable, Logger } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { eq } from "drizzle-orm"
import { DEFAULT_USER_ROLE, type UserRole } from "@my-ba/shared"
import { tenants, users, withAuthLookup, withTenant, type Database } from "@my-ba/db"
import { DATABASE } from "../database/database.tokens"
import { USER_DIRECTORY } from "./auth.tokens"
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

interface CacheEntry {
  identity: Identity
  expiresAt: number
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
  private readonly cache = new Map<string, CacheEntry>()
  private readonly ttlMs: number

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(USER_DIRECTORY) private readonly directory: UserDirectory,
    config: ConfigService,
  ) {
    this.ttlMs = config.get<number>("AUTH_IDENTITY_CACHE_TTL_MS", 60_000)
  }

  /**
   * In-process and deliberately small. It exists so the identity lookup is not
   * a database round trip on every authenticated request; it is not a session
   * store and must not become one. A role change takes up to the TTL to apply,
   * which is the accepted cost at one user. When P0-4 lands Redis this moves
   * there and the invalidation below becomes cross-process.
   */
  async resolve(externalAuthId: string): Promise<ResolvedIdentity> {
    const cached = this.cache.get(externalAuthId)
    if (cached && cached.expiresAt > Date.now()) {
      return { ...cached.identity, provisioned: false }
    }

    const found = await this.lookup(externalAuthId)
    if (found) {
      this.remember(externalAuthId, found)
      return { ...found, provisioned: false }
    }

    const created = await this.provision(externalAuthId)
    this.remember(externalAuthId, created.identity)
    return { ...created.identity, provisioned: created.provisioned }
  }

  invalidate(externalAuthId: string): void {
    this.cache.delete(externalAuthId)
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

  private remember(externalAuthId: string, identity: Identity): void {
    this.cache.set(externalAuthId, { identity, expiresAt: Date.now() + this.ttlMs })
  }
}
