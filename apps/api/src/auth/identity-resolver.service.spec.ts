import type { Database } from "@my-ba/db"
import { AUTH_LOOKUP_SETTING, TENANT_SETTING } from "@my-ba/db"
import type { ConfigService } from "@nestjs/config"
import type { SQL } from "drizzle-orm"
import { PgDialect } from "drizzle-orm/pg-core"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { InMemoryIdentityCache } from "./identity-cache"
import { IdentityResolverService, type Identity } from "./identity-resolver.service"
import type { UserDirectory } from "./user-directory"

const dialect = new PgDialect()

const IDENTITY: Identity = {
  userId: "11111111-2222-4333-8444-555555555555",
  tenantId: "99999999-2222-4333-8444-555555555555",
  email: "brian@example.com",
  displayName: "Brian Liu",
  role: "investor",
}

interface Harness {
  db: Database
  /** Every `set_config` the service issued, in order, as [key, value]. */
  settings: string[][]
  /** Rows the next `select` should return, consumed one call at a time. */
  lookups: (Identity | null)[]
  /** Called when the users insert reaches `.returning()`. */
  onInsertUser: () => Identity
}

function harness(): Harness {
  const state: Harness = {
    db: undefined as unknown as Database,
    settings: [],
    lookups: [],
    onInsertUser: () => IDENTITY,
  }

  const tx = {
    execute: async (query: SQL) => {
      const { params } = dialect.sqlToQuery(query)
      state.settings.push(params as string[])
    },
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => {
            const next = state.lookups.shift() ?? null
            return next ? [next] : []
          },
        }),
      }),
    }),
    insert: () => ({
      values: () => {
        const result = Promise.resolve(undefined) as Promise<undefined> & {
          returning: () => Promise<Identity[]>
        }

        // `await tx.insert(tenants).values(...)` — the tenants row.
        // `...values(...).returning(...)` — the users row, and the one that
        // can collide on users_external_auth_id_key.
        result.returning = async () => [state.onInsertUser()]

        return result
      },
    }),
  }

  state.db = {
    transaction: async <T>(callback: (tx: unknown) => Promise<T>) => callback(tx),
  } as unknown as Database

  return state
}

function build(state: Harness, directory: UserDirectory): IdentityResolverService {
  const config = { get: <T>(_key: string, fallback: T) => fallback } as unknown as ConfigService
  return new IdentityResolverService(state.db, directory, new InMemoryIdentityCache(), config)
}

function fakeDirectory(): UserDirectory & { fetch: ReturnType<typeof vi.fn> } {
  return {
    fetch: vi.fn(async () => ({ email: IDENTITY.email, displayName: IDENTITY.displayName })),
  }
}

describe("IdentityResolverService", () => {
  let state: Harness
  let directory: ReturnType<typeof fakeDirectory>
  let service: IdentityResolverService

  beforeEach(() => {
    state = harness()
    directory = fakeDirectory()
    service = build(state, directory)
  })

  describe("when the identity already exists", () => {
    it("resolves it without provisioning", async () => {
      state.lookups.push(IDENTITY)

      const resolved = await service.resolve("user_2abc")

      expect(resolved).toEqual({ ...IDENTITY, provisioned: false })
      expect(directory.fetch).not.toHaveBeenCalled()
    })

    /**
     * The lookup is the one query in the system that runs with no tenant (D46).
     * If it ever also set app.tenant_id, the transaction would stop being
     * limited to the single bootstrap row and start seeing a whole tenant's
     * user list — so the absence of that setting is asserted, not assumed.
     */
    it("looks up through the bootstrap setting and never sets a tenant", async () => {
      state.lookups.push(IDENTITY)

      await service.resolve("user_2abc")

      expect(state.settings).toEqual([[AUTH_LOOKUP_SETTING, "user_2abc"]])
      expect(state.settings.flat()).not.toContain(TENANT_SETTING)
    })

    it("serves the second call from cache without touching the database", async () => {
      state.lookups.push(IDENTITY)

      await service.resolve("user_2abc")
      const second = await service.resolve("user_2abc")

      expect(second).toEqual({ ...IDENTITY, provisioned: false })
      expect(state.settings).toHaveLength(1)
    })

    it("goes back to the database once the entry is invalidated", async () => {
      state.lookups.push(IDENTITY, IDENTITY)

      await service.resolve("user_2abc")
      await service.invalidate("user_2abc")
      await service.resolve("user_2abc")

      expect(state.settings).toHaveLength(2)
    })
  })

  describe("when the identity is new", () => {
    it("provisions a tenant and user, scoped to the tenant it is creating", async () => {
      state.lookups.push(null)

      const resolved = await service.resolve("user_2abc")

      expect(resolved.provisioned).toBe(true)
      expect(directory.fetch).toHaveBeenCalledWith("user_2abc")

      // The lookup runs first with no tenant; the inserts then run inside a
      // transaction already scoped to the uuid being created, which is what
      // lets both WITH CHECK clauses pass without any elevated privilege.
      const [lookup, provision] = state.settings
      expect(lookup?.[0]).toBe(AUTH_LOOKUP_SETTING)
      expect(provision?.[0]).toBe(TENANT_SETTING)
      expect(provision?.[1]).toMatch(/^[0-9a-f-]{36}$/)
    })

    /**
     * Two first requests arriving together. users_external_auth_id_key is
     * global, so exactly one insert survives; the loser must read back the
     * winner's rows rather than surfacing a 500 on someone's first sign-in.
     */
    it("recovers from a losing race by re-reading the winner's rows", async () => {
      state.lookups.push(null, IDENTITY)
      state.onInsertUser = () => {
        throw Object.assign(new Error("duplicate key value"), { code: "23505" })
      }

      const resolved = await service.resolve("user_2abc")

      expect(resolved).toEqual({ ...IDENTITY, provisioned: false })
    })

    it("rethrows an insert failure that is not a unique violation", async () => {
      state.lookups.push(null)
      state.onInsertUser = () => {
        throw Object.assign(new Error("deadlock detected"), { code: "40P01" })
      }

      await expect(service.resolve("user_2abc")).rejects.toThrow("deadlock detected")
    })
  })
})
