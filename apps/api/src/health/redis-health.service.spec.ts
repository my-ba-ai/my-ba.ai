import type { Redis } from "ioredis"
import { describe, expect, it, vi } from "vitest"
import { RedisHealthService } from "./redis-health.service"

function service(redis: Partial<Record<"ping" | "config", unknown>>) {
  return new RedisHealthService(redis as unknown as Redis)
}

describe("RedisHealthService", () => {
  it("reports ok with the eviction policy", async () => {
    const result = await service({
      ping: vi.fn(async () => "PONG"),
      config: vi.fn(async () => ["maxmemory-policy", "noeviction"]),
    }).check()

    expect(result.status).toBe("ok")
    expect(result.maxmemoryPolicy).toBe("noeviction")
  })

  it("reports ok with an unknown policy when CONFIG is refused", async () => {
    const result = await service({
      ping: vi.fn(async () => "PONG"),
      config: vi.fn(async () => {
        throw new Error("ERR unknown command 'CONFIG'")
      }),
    }).check()

    expect(result).toMatchObject({ status: "ok", maxmemoryPolicy: null })
  })

  it("reports unreachable when PING fails", async () => {
    const result = await service({
      ping: vi.fn(async () => {
        throw new Error("Connection is closed.")
      }),
    }).check()

    expect(result).toMatchObject({ status: "unreachable", maxmemoryPolicy: null })
  })
})
