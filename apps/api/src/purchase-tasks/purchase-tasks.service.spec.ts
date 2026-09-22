import { NotFoundException } from "@nestjs/common"
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

const ROW = {
  id: "aaaaaaaa-2222-4333-8444-555555555555",
  name: "Brisbane growth corridor",
  status: "SCREENING",
  lockedAt: null,
  clonedFromTaskId: null,
  createdAt: new Date("2026-09-21T01:00:00.000Z"),
  updatedAt: new Date("2026-09-21T02:00:00.000Z"),
}

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
    const { db } = fakeTenantDb({ ...ROW, criteria: { vacancyMax: 1.5 } })
    const detail = await new PurchaseTasksService(db).get(AUTH, ROW.id)
    expect(detail).toMatchObject({ id: ROW.id, criteria: { vacancyMax: 1.5 } })
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
})
