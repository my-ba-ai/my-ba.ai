import { BadRequestException, NotFoundException } from "@nestjs/common"
import type { ConfigService } from "@nestjs/config"
import type { AuthContext } from "@my-ba/shared"
import type { Queue } from "bullmq"
import { describe, expect, it, vi } from "vitest"
import type { TenantDatabaseService } from "../database/tenant-database.service"
import {
  DevScreeningService,
  devScreeningEnabled,
  SCREENING_JOB_NAME,
} from "./dev-screening.service"

const AUTH: AuthContext = {
  externalAuthId: "user_2abc",
  userId: "11111111-2222-4333-8444-555555555555",
  tenantId: "99999999-2222-4333-8444-555555555555",
  email: "brian@example.com",
  displayName: "Brian Liu",
  role: "investor",
  sessionId: "sess_1",
  provisioned: false,
}
const TASK = "22222222-2222-4333-8444-555555555555"

const RUNNABLE = {
  states: ["NSW"],
  propertyType: "house",
  bedrooms: "All",
  filters: {
    typicalPrice: { min: 400_000, max: 900_000 },
    maxVacancyRatePct: 2.5,
    maxDaysOnMarket: 65,
    highConfidenceOnly: true,
  },
  profile: {
    strategy: "balanced",
    risk: "medium",
    presetVersion: "2026-10-01.v1",
    weights: {
      yield_now: 0.3,
      rent_growth_12m: 0.3,
      price_growth_36m: 0.2,
      renter_band: 0.1,
      low_volatility: 0.1,
    },
    weightsCustomised: false,
    filtersCustomised: false,
  },
}

function setup(options: { rows: unknown[]; env?: Record<string, string> }) {
  const add = vi.fn(async () => ({ id: "7" }))
  const queue = { name: "screening", add } as unknown as Queue
  const run = vi.fn(async () => options.rows)
  const db = { run } as unknown as TenantDatabaseService
  const env = options.env ?? { NODE_ENV: "development", DEV_SCREENING_TRIGGER: "1" }
  const config = { get: (key: string) => env[key] } as unknown as ConfigService
  return { service: new DevScreeningService(queue, db, config), add, run }
}

describe("devScreeningEnabled", () => {
  it("is on only with the flag, and never in production", () => {
    expect(devScreeningEnabled({ nodeEnv: "development", flag: "1" })).toBe(true)
    expect(devScreeningEnabled({ nodeEnv: "development", flag: undefined })).toBe(false)
    expect(devScreeningEnabled({ nodeEnv: "production", flag: "1" })).toBe(false)
  })
})

describe("DevScreeningService (P1-4, D73)", () => {
  it("enqueues one deduplicated attempt with the tenant from the auth context", async () => {
    const { service, add, run } = setup({ rows: [{ criteria: RUNNABLE }] })
    await expect(service.enqueue(AUTH, TASK)).resolves.toEqual({
      jobId: "7",
      queue: "screening",
      taskId: TASK,
    })
    expect(run).toHaveBeenCalledWith(AUTH, expect.any(Function))
    expect(add).toHaveBeenCalledWith(
      SCREENING_JOB_NAME,
      expect.objectContaining({ tenantId: AUTH.tenantId, requestedBy: AUTH.userId, taskId: TASK }),
      { attempts: 1, deduplication: { id: `screening-${TASK}` } },
    )
  })

  it("404s when the flag is off, without touching the database", async () => {
    const { service, run } = setup({ rows: [], env: { NODE_ENV: "development" } })
    await expect(service.enqueue(AUTH, TASK)).rejects.toBeInstanceOf(NotFoundException)
    expect(run).not.toHaveBeenCalled()
  })

  it("404s for a task outside the tenant", async () => {
    const { service, add } = setup({ rows: [] })
    await expect(service.enqueue(AUTH, TASK)).rejects.toBeInstanceOf(NotFoundException)
    expect(add).not.toHaveBeenCalled()
  })

  it("400s for draft criteria", async () => {
    const { service, add } = setup({ rows: [{ criteria: { states: ["NSW"] } }] })
    await expect(service.enqueue(AUTH, TASK)).rejects.toBeInstanceOf(BadRequestException)
    expect(add).not.toHaveBeenCalled()
  })
})
