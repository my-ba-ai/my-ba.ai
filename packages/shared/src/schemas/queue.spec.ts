import { describe, expect, it } from "vitest"
import { parseRedisUrl, tenantJobSchema } from "./queue"

describe("parseRedisUrl", () => {
  it("parses a bare local URL with defaults", () => {
    expect(parseRedisUrl("redis://localhost")).toEqual({ host: "localhost", port: 6379, db: 0 })
  })

  it("parses credentials, port and database index", () => {
    expect(parseRedisUrl("redis://app:p%40ss@cache.internal:6380/2")).toEqual({
      host: "cache.internal",
      port: 6380,
      db: 2,
      username: "app",
      password: "p@ss",
    })
  })

  it("enables TLS for rediss://", () => {
    expect(parseRedisUrl("rediss://:secret@example.com:6379").tls).toEqual({})
  })

  it.each(["not a url", "http://localhost:6379", "redis://localhost/abc", "redis://localhost/-1"])(
    "rejects %s",
    (url) => {
      expect(() => parseRedisUrl(url)).toThrow(/REDIS_URL/)
    },
  )
})

describe("tenantJobSchema", () => {
  it("rejects a payload with no tenant", () => {
    const result = tenantJobSchema.safeParse({
      requestedBy: null,
      requestedAt: new Date().toISOString(),
    })
    expect(result.success).toBe(false)
  })
})
