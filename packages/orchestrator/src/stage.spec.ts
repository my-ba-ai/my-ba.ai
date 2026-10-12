import { describe, expect, it } from "vitest"
import { decisionFitsGate, type GatePayload } from "./stage"
import { stageFailureReason, StageFailedError } from "./stage-failure"
import { deriveStageResult } from "./thread-status"

const tooBroad = { kind: "SCREENING_TOO_BROAD" } as GatePayload
const approval = {
  kind: "SCREENING_APPROVAL",
  rankedSuburbs: [{ areaId: "NSW1" }, { areaId: "NSW2" }],
} as GatePayload

describe("decisionFitsGate", () => {
  it("too-broad only accepts 'adjusted, screen again' (D42: never continue)", () => {
    expect(decisionFitsGate(tooBroad, { approved: false })).toBe(true)
    expect(decisionFitsGate(tooBroad, { approved: true })).toBe(false)
  })

  it("approval accepts approve, a subset to keep, or reject", () => {
    expect(decisionFitsGate(approval, { approved: true })).toBe(true)
    expect(decisionFitsGate(approval, { approved: true, keep: ["NSW2"] })).toBe(true)
    expect(decisionFitsGate(approval, { approved: true, keep: ["VIC9"] })).toBe(false)
    expect(decisionFitsGate(approval, { approved: false })).toBe(true)
  })
})

describe("typed stage failures (P1-4 AC 5)", () => {
  it("round-trips the reason through the message", () => {
    const error = new StageFailedError("HTAG_QUOTA_EXCEEDED", "monthly cap spent")
    expect(error.message).toBe("[HTAG_QUOTA_EXCEEDED] monthly cap spent")
    expect(stageFailureReason(error.message)).toBe("HTAG_QUOTA_EXCEEDED")
    expect(stageFailureReason("boom")).toBeUndefined()
  })

  it("surfaces the reason on a failed StageResult", () => {
    const result = deriveStageResult({
      values: {},
      next: ["screen"],
      tasks: [
        { name: "screen", error: { message: "[HTAG_BALANCE_EXHAUSTED] top up" }, interrupts: [] },
      ],
      createdAt: "2026-10-09T00:00:00Z",
    })
    expect(result).toEqual({
      status: "failed",
      error: "screen: [HTAG_BALANCE_EXHAUSTED] top up",
      reason: "HTAG_BALANCE_EXHAUSTED",
    })
  })
})
