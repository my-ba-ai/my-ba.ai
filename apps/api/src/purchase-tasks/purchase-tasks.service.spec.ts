import { ConflictException, NotFoundException } from "@nestjs/common"
import type { AuthContext } from "@my-ba/shared"
import { describe, expect, it, vi } from "vitest"
import type { TenantDatabaseService } from "../database/tenant-database.service"
import { PurchaseTasksService } from "./purchase-tasks.service"

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

const NO_STAGE = { step: null, totalCostAud: "0.0000" }

const ROW = {
  id: "aaaaaaaa-2222-4333-8444-555555555555",
  name: "Brisbane growth corridor",
  status: "SCREENING",
  lockedAt: null,
  clonedFromTaskId: null,
  createdAt: new Date("2026-09-21T01:00:00.000Z"),
  updatedAt: new Date("2026-09-21T02:00:00.000Z"),
}

/** A detail read also carries Postgres `now()`; a minute after the attempt below. */
const DETAIL = { ...ROW, dbNow: new Date("2026-09-21T03:01:00.000Z") }

/**
 * `run` resolves to whatever the query would have returned. The query itself
 * is Drizzle's; what is under test is that it runs inside the caller's tenant
 * scope and that rows are mapped onto the shared contract.
 */
function fakeTenantDb(result: unknown) {
  const run = vi.fn(async () => result)
  return { db: { run } as unknown as TenantDatabaseService, run }
}

describe("PurchaseTasksService", () => {
  it("lists inside the caller's tenant scope and serialises dates to ISO strings", async () => {
    const { db, run } = fakeTenantDb([ROW])
    const response = await new PurchaseTasksService(db).list(AUTH)

    expect(run).toHaveBeenCalledWith(AUTH, expect.any(Function))
    expect(response).toEqual({
      items: [
        {
          ...ROW,
          createdAt: "2026-09-21T01:00:00.000Z",
          updatedAt: "2026-09-21T02:00:00.000Z",
        },
      ],
    })
  })

  it("returns an empty list rather than failing when the tenant has no tasks", async () => {
    const { db } = fakeTenantDb([])
    await expect(new PurchaseTasksService(db).list(AUTH)).resolves.toEqual({ items: [] })
  })

  it("serialises lockedAt when the task is locked", async () => {
    const lockedAt = new Date("2026-09-22T00:00:00.000Z")
    const { db } = fakeTenantDb([{ ...ROW, lockedAt }])
    const { items } = await new PurchaseTasksService(db).list(AUTH)
    expect(items[0]?.lockedAt).toBe("2026-09-22T00:00:00.000Z")
  })

  it("returns detail with criteria", async () => {
    const criteria = { states: ["QLD"], filters: { maxVacancyRatePct: 1.5 } }
    const { db } = fakeTenantDb({ row: { ...DETAIL, criteria }, stage: NO_STAGE })
    const detail = await new PurchaseTasksService(db).get(AUTH, ROW.id)
    expect(detail).toMatchObject({ id: ROW.id, criteria })
  })

  it("derives the screening block from the latest attempt (P1-6)", async () => {
    const step = {
      id: "bbbbbbbb-2222-4333-8444-555555555555",
      attempt: 2,
      status: "running",
      failureReason: null,
      costAud: "0.5000",
      gateKind: null,
      gateStatus: null,
      gatePayload: null,
      updatedAt: new Date("2026-09-21T03:00:00.000Z"),
    }
    const { db } = fakeTenantDb({
      row: { ...DETAIL, criteria: {} },
      stage: { step, totalCostAud: "1.7500" },
    })
    const detail = await new PurchaseTasksService(db).get(AUTH, ROW.id)
    expect(detail.screening).toEqual({
      state: "running",
      stalled: false,
      version: `${ROW.updatedAt.getTime()}-${step.updatedAt.getTime()}-0`,
      attempt: 2,
      gate: null,
      gateStatus: null,
      failureReason: null,
      costAud: "0.5000",
      totalCostAud: "1.7500",
    })
  })

  it("reports the stage's state and version from the narrow progress read (P1-6)", async () => {
    const stepUpdatedAt = new Date("2026-09-21T03:00:00.000Z")
    const { db, run } = fakeTenantDb({
      task: { status: "SCREENING", updatedAt: ROW.updatedAt, dbNow: DETAIL.dbNow },
      step: { attempt: 1, status: "completed", gateStatus: "awaiting", updatedAt: stepUpdatedAt },
    })
    await expect(new PurchaseTasksService(db).stageStatus(AUTH, ROW.id)).resolves.toEqual({
      state: "awaiting_approval",
      stalled: false,
      version: `${ROW.updatedAt.getTime()}-${stepUpdatedAt.getTime()}-0`,
    })
    expect(run).toHaveBeenCalledWith(AUTH, expect.any(Function))
  })

  it("reports a draft that never ran as no state, still versioned", async () => {
    const { db } = fakeTenantDb({
      task: { status: "DRAFT", updatedAt: ROW.updatedAt, dbNow: DETAIL.dbNow },
      step: null,
    })
    await expect(new PurchaseTasksService(db).stageStatus(AUTH, ROW.id)).resolves.toEqual({
      state: null,
      stalled: false,
      version: `${ROW.updatedAt.getTime()}-0-0`,
    })
  })

  it("404s the stage of a task the tenant cannot see", async () => {
    const { db } = fakeTenantDb(null)
    await expect(new PurchaseTasksService(db).stageStatus(AUTH, ROW.id)).rejects.toBeInstanceOf(
      NotFoundException,
    )
  })

  it("throws NotFound when the row is invisible — missing and other-tenant look the same", async () => {
    const { db } = fakeTenantDb(null)
    await expect(new PurchaseTasksService(db).get(AUTH, ROW.id)).rejects.toBeInstanceOf(
      NotFoundException,
    )
  })

  it("refuses to return a row that breaks the contract instead of passing it through", async () => {
    const { db } = fakeTenantDb([{ ...ROW, status: "NOT_A_STATUS" }])
    await expect(new PurchaseTasksService(db).list(AUTH)).rejects.toThrow()
  })

  it("refuses to return stored criteria that break the schema", async () => {
    const { db } = fakeTenantDb({
      row: { ...DETAIL, criteria: { vacancyMax: 1.5 } },
      stage: NO_STAGE,
    })
    await expect(new PurchaseTasksService(db).get(AUTH, ROW.id)).rejects.toThrow()
  })
})

const DRAFT_BODY = {
  intent: "draft" as const,
  name: "QLD cashflow",
  criteria: { states: ["QLD" as const] },
}

describe("PurchaseTasksService writes (P1-3)", () => {
  it("create inserts inside the caller's tenant scope and returns the detail", async () => {
    const { db, run } = fakeTenantDb([{ ...ROW, status: "DRAFT", criteria: DRAFT_BODY.criteria }])
    const detail = await new PurchaseTasksService(db).create(AUTH, DRAFT_BODY)
    expect(run).toHaveBeenCalledWith(AUTH, expect.any(Function))
    expect(detail).toMatchObject({ status: "DRAFT", criteria: { states: ["QLD"] } })
  })

  it("update 404s a missing or other-tenant task", async () => {
    const { db } = fakeTenantDb({ kind: "missing" })
    await expect(
      new PurchaseTasksService(db).update(AUTH, ROW.id, DRAFT_BODY),
    ).rejects.toBeInstanceOf(NotFoundException)
  })

  it("update 409s a task that is no longer a draft", async () => {
    const { db } = fakeTenantDb({ kind: "not-draft", status: "SCREENING" })
    await expect(
      new PurchaseTasksService(db).update(AUTH, ROW.id, DRAFT_BODY),
    ).rejects.toBeInstanceOf(ConflictException)
  })

  it("update returns the saved draft", async () => {
    const row = { ...ROW, status: "DRAFT", name: "Renamed", criteria: {} }
    const { db } = fakeTenantDb({ kind: "updated", row, stage: NO_STAGE })
    const detail = await new PurchaseTasksService(db).update(AUTH, ROW.id, {
      ...DRAFT_BODY,
      name: "Renamed",
      criteria: {},
    })
    expect(detail).toMatchObject({ name: "Renamed", criteria: {} })
  })

  it("screeningEstimate returns a contract-valid ceiling without any HtAG call", () => {
    const { db, run } = fakeTenantDb(null)
    const estimate = new PurchaseTasksService(db).screeningEstimate()
    expect(estimate.ceilingAud).toBeGreaterThan(0)
    expect(estimate.lines.length).toBeGreaterThan(0)
    expect(run).not.toHaveBeenCalled()
  })
})
