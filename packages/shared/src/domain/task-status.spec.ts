import { describe, expect, it } from "vitest"
import {
  TASK_STATUS_ORDER,
  canReturnToDraft,
  canTransition,
  isLegalStatusChange,
  isLocked,
  nextStatus,
  taskStatusSchema,
} from "./task-status"

describe("task status", () => {
  it("parses every declared status", () => {
    for (const status of TASK_STATUS_ORDER) {
      expect(taskStatusSchema.parse(status)).toBe(status)
    }
  })

  it("rejects an unknown status", () => {
    expect(taskStatusSchema.safeParse("SCREENIG").success).toBe(false)
  })

  it("walks the pipeline forward one stage at a time", () => {
    expect(nextStatus("DRAFT")).toBe("SCREENING")
    expect(nextStatus("AGENT_DISCOVERY")).toBe("CONTACT_AGENT")
    expect(nextStatus("CLOSED")).toBeNull()
  })

  it("allows only forward single-step transitions", () => {
    expect(canTransition("DRAFT", "SCREENING")).toBe(true)
    expect(canTransition("DRAFT", "GROWTH_ANALYSIS")).toBe(false)
    expect(canTransition("SCREENING", "DRAFT")).toBe(false)
  })

  it("locks from CONTACT_AGENT onwards", () => {
    expect(isLocked("AGENT_DISCOVERY")).toBe(false)
    expect(isLocked("CONTACT_AGENT")).toBe(true)
    expect(isLocked("CLOSED")).toBe(true)
  })

  it("allows exactly one backward edge: SCREENING back to DRAFT (D75)", () => {
    const backward = TASK_STATUS_ORDER.filter((status) => canReturnToDraft(status))
    expect(backward).toEqual(["SCREENING"])
    expect(isLegalStatusChange("SCREENING", "DRAFT")).toBe(true)
    expect(isLegalStatusChange("TREND_ANALYSIS", "DRAFT")).toBe(false)
    expect(isLegalStatusChange("DRAFT", "DRAFT")).toBe(false)
  })

  it("treats every other change as illegal unless it is one step forward", () => {
    for (const from of TASK_STATUS_ORDER) {
      for (const to of TASK_STATUS_ORDER) {
        const expected = canTransition(from, to) || (from === "SCREENING" && to === "DRAFT")
        expect(isLegalStatusChange(from, to)).toBe(expected)
      }
    }
  })
})
