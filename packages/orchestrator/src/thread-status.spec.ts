import { describe, expect, it } from "vitest"
import { threadIdFor } from "./stage"
import { deriveStageResult, type SnapshotLike } from "./thread-status"

const gate = { kind: "approval", stage: "spike", summary: "Approve 1", items: ["a"] }
const base: SnapshotLike = {
  values: {},
  next: [],
  tasks: [],
  metadata: { step: 1 },
  createdAt: "2026-09-17T00:00:00Z",
}

describe("deriveStageResult", () => {
  it("treats a snapshot with no checkpoint as not started", () => {
    expect(deriveStageResult({ values: {}, next: [], tasks: [] })).toEqual({
      status: "not_started",
    })
  })

  it("reports a pending interrupt as awaiting approval", () => {
    const result = deriveStageResult({
      ...base,
      next: ["approval_gate"],
      tasks: [{ name: "approval_gate", interrupts: [{ value: gate }] }],
    })
    expect(result).toEqual({ status: "awaiting_approval", gate })
  })

  it("rejects an interrupt payload that is not a gate", () => {
    expect(() =>
      deriveStageResult({
        ...base,
        next: ["approval_gate"],
        tasks: [{ name: "approval_gate", interrupts: [{ value: { nope: true } }] }],
      }),
    ).toThrow()
  })

  it("fails loudly on more than one pending interrupt", () => {
    const result = deriveStageResult({
      ...base,
      next: ["a", "b"],
      tasks: [
        { name: "a", interrupts: [{ value: gate }] },
        { name: "b", interrupts: [{ value: gate }] },
      ],
    })
    expect(result.status).toBe("failed")
  })

  it("reports pending work without an interrupt as incomplete", () => {
    const result = deriveStageResult({
      ...base,
      next: ["finalise"],
      tasks: [{ name: "finalise", interrupts: [] }],
    })
    expect(result).toEqual({ status: "incomplete", next: ["finalise"] })
  })

  it("prefers a task error over everything else", () => {
    const result = deriveStageResult({
      ...base,
      next: ["finalise"],
      tasks: [{ name: "finalise", error: new Error("boom"), interrupts: [] }],
    })
    expect(result).toEqual({ status: "failed", error: "finalise: boom" })
  })

  it("returns the output once the thread has finished", () => {
    const output = { approved: true, items: ["a"] }
    expect(deriveStageResult({ ...base, values: { output } })).toEqual({
      status: "completed",
      output,
    })
  })

  it("flags a finished thread with no output", () => {
    expect(deriveStageResult(base).status).toBe("failed")
  })
})

describe("threadIdFor", () => {
  it("puts the tenant first", () => {
    const tenantId = "11111111-2222-4333-8444-555555555555"
    const taskId = "66666666-7777-4888-9999-aaaaaaaaaaaa"
    expect(threadIdFor({ tenantId, taskId, stage: "spike" })).toBe(
      `tenant:${tenantId}:task:${taskId}:stage:spike`,
    )
  })

  it("refuses ids that could forge a prefix", () => {
    expect(() =>
      threadIdFor({ tenantId: "x:task:y", taskId: "z", stage: "spike" } as never),
    ).toThrow()
  })
})
