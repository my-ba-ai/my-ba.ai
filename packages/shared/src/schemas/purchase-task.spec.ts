import { describe, expect, it } from "vitest"
import {
  listPurchaseTasksResponseSchema,
  purchaseTaskDetailSchema,
  purchaseTaskIdParamSchema,
  purchaseTaskSummarySchema,
} from "./purchase-task"

const SUMMARY = {
  id: "11111111-2222-4333-8444-555555555555",
  name: "Brisbane growth corridor",
  status: "DRAFT",
  lockedAt: null,
  clonedFromTaskId: null,
  createdAt: "2026-09-21T01:00:00.000Z",
  updatedAt: "2026-09-21T02:00:00.000Z",
}

describe("purchase task contract", () => {
  it("accepts a well-formed summary", () => {
    expect(purchaseTaskSummarySchema.parse(SUMMARY)).toEqual(SUMMARY)
  })

  it("rejects a status outside the state machine", () => {
    expect(purchaseTaskSummarySchema.safeParse({ ...SUMMARY, status: "SHORTLISTED" }).success).toBe(
      false,
    )
  })

  it("rejects a Date object where the wire format is an ISO string", () => {
    expect(purchaseTaskSummarySchema.safeParse({ ...SUMMARY, createdAt: new Date() }).success).toBe(
      false,
    )
  })

  it("carries draft criteria on the detail shape, including the pre-P1-3 empty object", () => {
    expect(purchaseTaskDetailSchema.parse({ ...SUMMARY, criteria: {} }).criteria).toEqual({})
    const detail = purchaseTaskDetailSchema.parse({
      ...SUMMARY,
      criteria: { states: ["QLD"], filters: { maxVacancyRatePct: 1.5 } },
    })
    expect(detail.criteria.filters?.maxVacancyRatePct).toBe(1.5)
  })

  it("rejects criteria keys outside the schema (P1-3)", () => {
    expect(
      purchaseTaskDetailSchema.safeParse({ ...SUMMARY, criteria: { vacancyMax: 1.5 } }).success,
    ).toBe(false)
  })

  it("wraps the list in items", () => {
    expect(listPurchaseTasksResponseSchema.parse({ items: [] })).toEqual({ items: [] })
  })

  it("rejects a non-uuid task id", () => {
    expect(purchaseTaskIdParamSchema.safeParse("not-a-uuid").success).toBe(false)
  })
})
