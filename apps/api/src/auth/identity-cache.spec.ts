import type { Redis } from "ioredis"
import { describe, expect, it, vi } from "vitest"
import {
  type CachedIdentity,
  IDENTITY_CACHE_KEY_PREFIX,
  RedisIdentityCache,
} from "./identity-cache"

const IDENTITY: CachedIdentity = {
  userId: "11111111-2222-4333-8444-555555555555",
  tenantId: "99999999-2222-4333-8444-555555555555",
  email: "brian@example.com",
  displayName: "Brian Liu",
  role: "investor",
}

function fakeRedis(overrides: Partial<Record<"get" | "set" | "del", unknown>> = {}) {
  const store = new Map<string, string>()
  const redis = {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (key: string, value: string) => {
      store.set(key, value)
      return "OK"
    }),
    del: vi.fn(async (key: string) => (store.delete(key) ? 1 : 0)),
    ...overrides,
  }
  return { redis: redis as unknown as Redis, store, mocks: redis }
}

describe("RedisIdentityCache", () => {
  it("round-trips an identity with a PX TTL under the namespaced key", async () => {
    const { redis, mocks } = fakeRedis()
    const cache = new RedisIdentityCache(redis)

    await cache.set("user_1", IDENTITY, 60_000)

    expect(mocks.set).toHaveBeenCalledWith(
      `${IDENTITY_CACHE_KEY_PREFIX}user_1`,
      expect.any(String),
      "PX",
      60_000,
    )
    expect(await cache.get("user_1")).toEqual(IDENTITY)
  })

  it("treats a malformed entry as a miss and removes it", async () => {
    const { redis, store } = fakeRedis()
    store.set(`${IDENTITY_CACHE_KEY_PREFIX}user_1`, JSON.stringify({ tenantId: "nope" }))
    const cache = new RedisIdentityCache(redis)

    expect(await cache.get("user_1")).toBeNull()
    expect(store.has(`${IDENTITY_CACHE_KEY_PREFIX}user_1`)).toBe(false)
  })

  it("treats unparseable JSON as a miss", async () => {
    const { redis, store } = fakeRedis()
    store.set(`${IDENTITY_CACHE_KEY_PREFIX}user_1`, "{not json")
    expect(await new RedisIdentityCache(redis).get("user_1")).toBeNull()
  })

  it("degrades to a miss when Redis is down", async () => {
    const { redis } = fakeRedis({
      get: vi.fn(async () => {
        throw new Error("Stream isn't writeable and enableOfflineQueue options is false")
      }),
    })
    expect(await new RedisIdentityCache(redis).get("user_1")).toBeNull()
  })

  it("swallows write failures", async () => {
    const { redis } = fakeRedis({
      set: vi.fn(async () => {
        throw new Error("down")
      }),
    })
    await expect(new RedisIdentityCache(redis).set("user_1", IDENTITY, 1_000)).resolves.toBe(
      undefined,
    )
  })

  it("surfaces invalidation failures", async () => {
    const { redis } = fakeRedis({
      del: vi.fn(async () => {
        throw new Error("down")
      }),
    })
    await expect(new RedisIdentityCache(redis).delete("user_1")).rejects.toThrow("down")
  })
})
