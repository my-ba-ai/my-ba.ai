import { Test } from "@nestjs/testing"
import { databaseHealthResponseSchema, healthResponseSchema } from "@my-ba/shared"
import { beforeEach, describe, expect, it } from "vitest"
import { DatabaseHealthService } from "./database-health.service"
import { HealthController } from "./health.controller"
import { HealthService } from "./health.service"

const stubDatabaseHealth = {
  check: async () =>
    databaseHealthResponseSchema.parse({
      status: "ok",
      latencyMs: 1,
      extensions: { timescaledb: "2.17.2", vector: "0.8.0" },
      rlsEnforced: true,
      timestamp: new Date().toISOString(),
    }),
}

describe("HealthController", () => {
  let controller: HealthController

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        HealthService,
        { provide: DatabaseHealthService, useValue: stubDatabaseHealth },
      ],
    }).compile()

    controller = moduleRef.get(HealthController)
  })

  it("returns a payload matching the shared health schema", () => {
    const result = controller.check()
    expect(healthResponseSchema.safeParse(result).success).toBe(true)
    expect(result.service).toBe("api")
  })

  it("returns a payload matching the shared database health schema", async () => {
    const result = await controller.checkDatabase()
    expect(databaseHealthResponseSchema.safeParse(result).success).toBe(true)
  })
})
