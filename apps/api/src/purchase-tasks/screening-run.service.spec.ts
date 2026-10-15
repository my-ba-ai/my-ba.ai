import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common"
import type { LatestStep, LockedTask } from "@my-ba/db"
import {
  type AuthContext,
  screeningGateSchema,
  TASK_STATUS_ORDER,
  type TaskStatus,
} from "@my-ba/shared"
import type { Queue } from "bullmq"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { TenantDatabaseService } from "../database/tenant-database.service"
import type { PurchaseTasksService } from "./purchase-tasks.service"
import { ScreeningRunService } from "./screening-run.service"
import { SCREENING_STALL_AFTER_MS } from "./screening-stage"

/**
 * The db helpers are the seam: what is under test is which ones the service
 * calls, in which state, and that every refusal happens before the enqueue
 * (AC 8). The SQL behind them is covered by the db integration suite.
 */
const db = vi.hoisted(() => ({
  lockTask: vi.fn(),
  readLatestStep: vi.fn(),
  changeTaskStatus: vi.fn(),
  touchTask: vi.fn(),
  touchLatestStep: vi.fn(),
  decideGate: vi.fn(),
}))
vi.mock("@my-ba/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@my-ba/db")>()),
  ...db,
}))

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
const TASK_ID = "aaaaaaaa-2222-4333-8444-555555555555"
const STEP_ID = "bbbbbbbb-2222-4333-8444-555555555555"
const SUBURB_ID = "cccccccc-2222-4333-8444-555555555555"
const T0 = new Date("2026-10-13T01:00:00.000Z")
const T1 = new Date("2026-10-13T02:00:00.000Z")
/** Postgres `now()` on the locked row: a second after T1, so nothing is stalled by default. */
const NOW = new Date(T1.getTime() + 1_000)

const CRITERIA = {
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
      yield_now: 0.27,
      rent_growth_12m: 0.27,
      price_growth_36m: 0.225,
      renter_band: 0.135,
      low_volatility: 0.1,
    },
    weightsCustomised: false,
    filtersCustomised: false,
  },
}

const gateBase = {
  stage: "screening",
  analysisStepId: STEP_ID,
  attempt: 1,
  criteria: CRITERIA,
  costAud: "1.0000",
}
const APPROVAL_GATE = screeningGateSchema.parse({
  ...gateBase,
  kind: "SCREENING_APPROVAL",
  rankedSuburbs: [
    {
      rank: 1,
      areaId: "loc-a",
      suburbId: SUBURB_ID,
      name: "Penrith",
      state: "NSW",
      postcode: "2750",
      score: 0.8,
      coverage: 1,
      insufficientData: false,
      raw: {
        yieldNow: 0.045,
        rentGrowth12m: 0.06,
        priceGrowth36m: 0.2,
        renterProportion: 0.35,
        priceVolatility: 0.01,
      },
      supply: null,
    },
  ],
  disabledFactors: [],
  renterCoverage: 1,
  droppedAreaIds: [],
})
const TOO_BROAD_GATE = screeningGateSchema.parse({
  ...gateBase,
  kind: "SCREENING_TOO_BROAD",
  returned: 1000,
  limit: 1000,
})

function task(overrides: Partial<LockedTask> = {}): LockedTask {
  return {
    status: "DRAFT",
    lockedAt: null,
    criteria: CRITERIA,
    updatedAt: T0,
    dbNow: NOW,
    ...overrides,
  }
}

function step(overrides: Partial<LatestStep> = {}): LatestStep {
  return {
    id: STEP_ID,
    attempt: 1,
    status: "completed",
    failureReason: null,
    costAud: "1.0000",
    gateKind: "SCREENING_APPROVAL",
    gateStatus: "awaiting",
    gatePayload: APPROVAL_GATE,
    updatedAt: T1,
    ...overrides,
  }
}

function setup() {
  const add = vi.fn(async () => ({ id: "job-1" }))
  const queue = { add, name: "screening" } as unknown as Queue
  const run = vi.fn(async (_auth: AuthContext, fn: (tx: unknown) => Promise<unknown>) => fn({}))
  const tenantDb = { run } as unknown as TenantDatabaseService
  const get = vi.fn(async () => ({ id: TASK_ID }))
  const tasks = { get } as unknown as PurchaseTasksService
  return { service: new ScreeningRunService(queue, tenantDb, tasks), add, run, get }
}

beforeEach(() => {
  for (const fn of Object.values(db)) fn.mockReset()
  db.changeTaskStatus.mockResolvedValue(true)
  db.decideGate.mockResolvedValue(true)
  db.touchTask.mockResolvedValue(undefined)
  db.touchLatestStep.mockResolvedValue(undefined)
  db.readLatestStep.mockResolvedValue(null)
})

describe("ScreeningRunService.run (P1-6)", () => {
  it("moves a runnable draft to SCREENING and enqueues one run job (AC 1)", async () => {
    db.lockTask.mockResolvedValue(task())
    const { service, add, get } = setup()
    await expect(service.run(AUTH, TASK_ID)).resolves.toEqual({ id: TASK_ID })
    expect(db.changeTaskStatus).toHaveBeenCalledWith({}, TASK_ID, "DRAFT", "SCREENING")
    expect(add).toHaveBeenCalledTimes(1)
    expect(add).toHaveBeenCalledWith(
      "run",
      expect.objectContaining({ action: "run", taskId: TASK_ID, tenantId: AUTH.tenantId }),
      { attempts: 1 },
    )
    expect(get).toHaveBeenCalledWith(AUTH, TASK_ID)
  })

  it("400s criteria that are not runnable, before any write or enqueue", async () => {
    db.lockTask.mockResolvedValue(task({ criteria: { states: ["NSW"] } }))
    const { service, add } = setup()
    await expect(service.run(AUTH, TASK_ID)).rejects.toBeInstanceOf(BadRequestException)
    expect(db.changeTaskStatus).not.toHaveBeenCalled()
    expect(add).not.toHaveBeenCalled()
  })

  it("409s a second run while screening (AC 1)", async () => {
    db.lockTask.mockResolvedValue(task({ status: "SCREENING" }))
    db.readLatestStep.mockResolvedValue(
      step({ status: "running", gateKind: null, gateStatus: null, gatePayload: null }),
    )
    const { service, add } = setup()
    await expect(service.run(AUTH, TASK_ID)).rejects.toBeInstanceOf(ConflictException)
    expect(add).not.toHaveBeenCalled()
  })

  it("retries a failed attempt from SCREENING (AC 7)", async () => {
    db.lockTask.mockResolvedValue(task({ status: "SCREENING" }))
    db.readLatestStep.mockResolvedValue(
      step({
        status: "failed",
        failureReason: "HTAG_QUOTA_EXCEEDED",
        gateKind: null,
        gateStatus: null,
        gatePayload: null,
      }),
    )
    const { service, add } = setup()
    await service.run(AUTH, TASK_ID)
    expect(db.touchTask).toHaveBeenCalledWith({}, TASK_ID)
    expect(db.changeTaskStatus).not.toHaveBeenCalled()
    expect(add).toHaveBeenCalledTimes(1)
  })

  it("409s a retry that is already queued", async () => {
    db.lockTask.mockResolvedValue(task({ status: "SCREENING", updatedAt: T1 }))
    db.readLatestStep.mockResolvedValue(
      step({
        status: "failed",
        updatedAt: T0,
        gateKind: null,
        gateStatus: null,
        gatePayload: null,
      }),
    )
    const { service, add } = setup()
    await expect(service.run(AUTH, TASK_ID)).rejects.toBeInstanceOf(ConflictException)
    expect(add).not.toHaveBeenCalled()
  })

  it("retries a stalled stage: completed attempt whose gate sync was lost", async () => {
    const stalledAt = new Date(T1.getTime() + SCREENING_STALL_AFTER_MS)
    db.lockTask.mockResolvedValue(task({ status: "SCREENING", dbNow: stalledAt }))
    db.readLatestStep.mockResolvedValue(
      step({ gateKind: null, gateStatus: null, gatePayload: null }),
    )
    const { service, add } = setup()
    await service.run(AUTH, TASK_ID)
    expect(db.touchTask).toHaveBeenCalledWith({}, TASK_ID)
    expect(add).toHaveBeenCalledWith("run", expect.objectContaining({ action: "run" }), {
      attempts: 1,
    })
  })

  it("retries a stalled approval request", async () => {
    const requested = new Date(T1.getTime() + 1)
    db.lockTask.mockResolvedValue(
      task({
        status: "SCREENING",
        updatedAt: requested,
        dbNow: new Date(requested.getTime() + SCREENING_STALL_AFTER_MS),
      }),
    )
    db.readLatestStep.mockResolvedValue(step())
    const { service, add } = setup()
    await service.run(AUTH, TASK_ID)
    expect(add).toHaveBeenCalledTimes(1)
  })

  it("409s a run while the worker is still inside the stall window", async () => {
    const justBefore = new Date(T1.getTime() + SCREENING_STALL_AFTER_MS - 1)
    db.lockTask.mockResolvedValue(task({ status: "SCREENING", dbNow: justBefore }))
    db.readLatestStep.mockResolvedValue(
      step({ gateKind: null, gateStatus: null, gatePayload: null }),
    )
    const { service, add } = setup()
    await expect(service.run(AUTH, TASK_ID)).rejects.toBeInstanceOf(ConflictException)
    expect(add).not.toHaveBeenCalled()
  })

  it("409s a run on a stage awaiting the user, however long it has waited", async () => {
    db.lockTask.mockResolvedValue(
      task({ status: "SCREENING", dbNow: new Date(T1.getTime() + 10 * SCREENING_STALL_AFTER_MS) }),
    )
    db.readLatestStep.mockResolvedValue(step())
    const { service, add } = setup()
    await expect(service.run(AUTH, TASK_ID)).rejects.toBeInstanceOf(ConflictException)
    expect(add).not.toHaveBeenCalled()
  })

  it("puts the task back in DRAFT when the enqueue fails", async () => {
    db.lockTask.mockResolvedValue(task())
    const { service, add } = setup()
    add.mockRejectedValueOnce(new Error("redis down"))
    await expect(service.run(AUTH, TASK_ID)).rejects.toThrow("redis down")
    expect(db.changeTaskStatus).toHaveBeenLastCalledWith({}, TASK_ID, "SCREENING", "DRAFT")
  })

  it("404s a task the tenant cannot see (AC 8)", async () => {
    db.lockTask.mockResolvedValue(null)
    const { service, add } = setup()
    await expect(service.run(AUTH, TASK_ID)).rejects.toBeInstanceOf(NotFoundException)
    expect(add).not.toHaveBeenCalled()
  })

  it("409s a locked task", async () => {
    db.lockTask.mockResolvedValue(task({ lockedAt: T0 }))
    const { service } = setup()
    await expect(service.run(AUTH, TASK_ID)).rejects.toBeInstanceOf(ConflictException)
  })
})

describe("ScreeningRunService.approve (P1-6)", () => {
  it("marks the approval requested and enqueues an approve job with keep (AC 3)", async () => {
    db.lockTask.mockResolvedValue(task({ status: "SCREENING" }))
    db.readLatestStep.mockResolvedValue(step())
    const { service, add } = setup()
    await service.approve(AUTH, TASK_ID, { keep: ["loc-a"], note: "go" })
    expect(db.touchTask).toHaveBeenCalledWith({}, TASK_ID)
    expect(add).toHaveBeenCalledWith(
      "approve",
      expect.objectContaining({ action: "approve", keep: ["loc-a"], note: "go" }),
      { attempts: 1 },
    )
  })

  it("400s keep ids outside the ranking, with no job (AC 3)", async () => {
    db.lockTask.mockResolvedValue(task({ status: "SCREENING" }))
    db.readLatestStep.mockResolvedValue(step())
    const { service, add } = setup()
    await expect(service.approve(AUTH, TASK_ID, { keep: ["loc-z"] })).rejects.toBeInstanceOf(
      BadRequestException,
    )
    expect(db.touchTask).not.toHaveBeenCalled()
    expect(add).not.toHaveBeenCalled()
  })

  it("409s approve on a too-broad gate (AC 6)", async () => {
    db.lockTask.mockResolvedValue(task({ status: "SCREENING" }))
    db.readLatestStep.mockResolvedValue(
      step({ gateKind: "SCREENING_TOO_BROAD", gatePayload: TOO_BROAD_GATE }),
    )
    const { service, add } = setup()
    await expect(service.approve(AUTH, TASK_ID, {})).rejects.toBeInstanceOf(ConflictException)
    expect(add).not.toHaveBeenCalled()
  })

  it("409s a second approve while the first is queued", async () => {
    db.lockTask.mockResolvedValue(
      task({ status: "SCREENING", updatedAt: new Date(T1.getTime() + 1) }),
    )
    db.readLatestStep.mockResolvedValue(step())
    const { service, add } = setup()
    await expect(service.approve(AUTH, TASK_ID, {})).rejects.toBeInstanceOf(ConflictException)
    expect(add).not.toHaveBeenCalled()
  })

  it("undoes the request marker when the enqueue fails", async () => {
    db.lockTask.mockResolvedValue(task({ status: "SCREENING" }))
    db.readLatestStep.mockResolvedValue(step())
    const { service, add } = setup()
    add.mockRejectedValueOnce(new Error("redis down"))
    await expect(service.approve(AUTH, TASK_ID, {})).rejects.toThrow("redis down")
    expect(db.touchLatestStep).toHaveBeenCalledWith({}, TASK_ID, "screening")
  })
})

describe("ScreeningRunService.reject (P1-6)", () => {
  it.each([
    ["approval", APPROVAL_GATE],
    ["too-broad", TOO_BROAD_GATE],
  ])(
    "records the rejection and returns the task to DRAFT, with no job (%s gate, AC 4/6)",
    async (_label, gate) => {
      db.lockTask.mockResolvedValue(task({ status: "SCREENING" }))
      db.readLatestStep.mockResolvedValue(step({ gateKind: gate.kind, gatePayload: gate }))
      const { service, add } = setup()
      await service.reject(AUTH, TASK_ID, { note: "tighten yield" })
      expect(db.decideGate).toHaveBeenCalledWith(
        {},
        {
          analysisStepId: STEP_ID,
          status: "rejected",
          decision: { approved: false, note: "tighten yield" },
          decidedBy: AUTH.userId,
        },
      )
      expect(db.changeTaskStatus).toHaveBeenCalledWith({}, TASK_ID, "SCREENING", "DRAFT")
      expect(add).not.toHaveBeenCalled()
    },
  )

  it("409s when the gate was already answered", async () => {
    db.lockTask.mockResolvedValue(task({ status: "SCREENING" }))
    db.readLatestStep.mockResolvedValue(step({ gateStatus: "rejected" }))
    const { service } = setup()
    await expect(service.reject(AUTH, TASK_ID, {})).rejects.toBeInstanceOf(ConflictException)
    expect(db.decideGate).not.toHaveBeenCalled()
  })
})

/**
 * AC 9: every endpoint × status pair. The step is the one each action would
 * want (failed for run from SCREENING, an awaiting approval gate otherwise),
 * so the only thing deciding the outcome is the task status.
 */
describe("endpoint × status (AC 9)", () => {
  const allowed: Record<"run" | "approve" | "reject", readonly TaskStatus[]> = {
    run: ["DRAFT", "SCREENING"],
    approve: ["SCREENING"],
    reject: ["SCREENING"],
  }

  for (const action of ["run", "approve", "reject"] as const) {
    for (const status of TASK_STATUS_ORDER) {
      const ok = allowed[action].includes(status)
      it(`${action} on ${status} → ${ok ? "accepted" : "409"}`, async () => {
        db.lockTask.mockResolvedValue(task({ status }))
        db.readLatestStep.mockResolvedValue(
          action === "run"
            ? step({ status: "failed", gateKind: null, gateStatus: null, gatePayload: null })
            : step(),
        )
        const { service, add } = setup()
        const call =
          action === "run"
            ? service.run(AUTH, TASK_ID)
            : action === "approve"
              ? service.approve(AUTH, TASK_ID, {})
              : service.reject(AUTH, TASK_ID, {})
        if (ok) {
          await expect(call).resolves.toEqual({ id: TASK_ID })
        } else {
          await expect(call).rejects.toBeInstanceOf(ConflictException)
          expect(add).not.toHaveBeenCalled()
          expect(db.changeTaskStatus).not.toHaveBeenCalled()
        }
      })
    }
  }
})
