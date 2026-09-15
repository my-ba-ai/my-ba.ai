import type { DatabasePool } from "@my-ba/db"
import { databaseHealthResponseSchema } from "@my-ba/shared"
import { describe, expect, it, vi } from "vitest"
import { DatabaseHealthService } from "./database-health.service"

function poolReturning(rows: {
  extensions: { extname: string; extversion: string }[]
  role: { rolsuper: boolean; rolbypassrls: boolean }[]
}): DatabasePool {
  const client = {
    query: vi.fn(async (text: string) =>
      text.includes("pg_extension") ? { rows: rows.extensions } : { rows: rows.role },
    ),
    release: vi.fn(),
  }
  return { connect: async () => client } as unknown as DatabasePool
}

describe("DatabaseHealthService", () => {
  it("reports extension versions and RLS enforcement for a plain role", async () => {
    const service = new DatabaseHealthService(
      poolReturning({
        extensions: [
          { extname: "timescaledb", extversion: "2.17.2" },
          { extname: "vector", extversion: "0.8.0" },
        ],
        role: [{ rolsuper: false, rolbypassrls: false }],
      }),
    )

    const result = await service.check()

    expect(databaseHealthResponseSchema.safeParse(result).success).toBe(true)
    expect(result.status).toBe("ok")
    expect(result.extensions).toEqual({ timescaledb: "2.17.2", vector: "0.8.0" })
    expect(result.rlsEnforced).toBe(true)
  })

  it("flags a superuser connection, because every RLS policy is inert for one", async () => {
    const service = new DatabaseHealthService(
      poolReturning({
        extensions: [],
        role: [{ rolsuper: true, rolbypassrls: false }],
      }),
    )

    const result = await service.check()

    expect(result.rlsEnforced).toBe(false)
    expect(result.extensions.timescaledb).toBeNull()
  })

  it("reports unreachable rather than throwing when the pool is down", async () => {
    const pool = {
      connect: async () => {
        throw new Error("ECONNREFUSED")
      },
    } as unknown as DatabasePool

    const result = await new DatabaseHealthService(pool).check()

    expect(result.status).toBe("unreachable")
    expect(result.rlsEnforced).toBe(false)
  })
})
