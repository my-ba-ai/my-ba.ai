import { describe, expect, it } from "vitest"
import {
  approveScreeningRequestSchema,
  rejectScreeningRequestSchema,
  screeningJobSchema,
  screeningStageSchema,
} from "./screening"

const BASE_JOB = {
  tenantId: "11111111-2222-4333-8444-555555555555",
  requestedBy: "22222222-2222-4333-8444-555555555555",
  requestedAt: "2026-10-13T01:00:00.000Z",
  taskId: "33333333-2222-4333-8444-555555555555",
}

describe("screening job (P1-6)", () => {
  it("accepts run and approve actions", () => {
    expect(screeningJobSchema.parse({ ...BASE_JOB, action: "run" }).action).toBe("run")
    const approve = screeningJobSchema.parse({ ...BASE_JOB, action: "approve", keep: ["a"] })
    expect(approve.action === "approve" && approve.keep).toEqual(["a"])
  })

  it("rejects a job without an action or a tenant", () => {
    expect(screeningJobSchema.safeParse(BASE_JOB).success).toBe(false)
    const { tenantId: _tenantId, ...noTenant } = BASE_JOB
    expect(screeningJobSchema.safeParse({ ...noTenant, action: "run" }).success).toBe(false)
  })
})

describe("gate requests (P1-6)", () => {
  it("approve takes an optional keep list and note, nothing else", () => {
    expect(approveScreeningRequestSchema.parse({})).toEqual({})
    expect(approveScreeningRequestSchema.safeParse({ approved: true }).success).toBe(false)
    expect(approveScreeningRequestSchema.safeParse({ keep: [""] }).success).toBe(false)
  })

  it("reject takes an optional note only", () => {
    expect(rejectScreeningRequestSchema.parse({ note: " tighten yield " })).toEqual({
      note: "tighten yield",
    })
    expect(rejectScreeningRequestSchema.safeParse({ keep: [] }).success).toBe(false)
  })
})

describe("screening stage block (P1-6)", () => {
  it("accepts a queued stage with no attempt yet", () => {
    const stage = {
      state: "queued",
      stalled: false,
      version: "1-0-0",
      attempt: null,
      gate: null,
      gateStatus: null,
      failureReason: null,
      costAud: "0.0000",
      totalCostAud: "0.0000",
    }
    expect(screeningStageSchema.parse(stage)).toEqual(stage)
  })

  it("rejects an unknown failure reason", () => {
    expect(
      screeningStageSchema.safeParse({
        state: "failed",
        stalled: false,
        version: "1-1-0",
        attempt: 1,
        gate: null,
        gateStatus: null,
        failureReason: "OOPS",
        costAud: "0",
        totalCostAud: "0",
      }).success,
    ).toBe(false)
  })
})
