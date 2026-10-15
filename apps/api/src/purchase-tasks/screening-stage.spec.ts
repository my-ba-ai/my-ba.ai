import type { LatestStep } from "@my-ba/db"
import type { TaskStatus } from "@my-ba/shared"
import { describe, expect, it } from "vitest"
import {
  deriveScreeningProgress,
  deriveScreeningStage,
  SCREENING_STALL_AFTER_MS,
} from "./screening-stage"

const T0 = new Date("2026-10-13T01:00:00.000Z")
const T1 = new Date("2026-10-13T02:00:00.000Z")

function step(overrides: Partial<LatestStep> = {}): LatestStep {
  return {
    id: "bbbbbbbb-2222-4333-8444-555555555555",
    attempt: 1,
    status: "running",
    failureReason: null,
    costAud: "0.2500",
    gateKind: null,
    gateStatus: null,
    gatePayload: null,
    updatedAt: T1,
    ...overrides,
  }
}

/** A second after the later fixture timestamp: nothing here is stalled. */
const NOW = new Date(T1.getTime() + 1_000)
const later = (ms: number) => new Date(T1.getTime() + ms)

const state = (taskStatus: TaskStatus, s: LatestStep | null, taskUpdatedAt = T0) =>
  deriveScreeningStage({ taskStatus, taskUpdatedAt, step: s, now: NOW, totalCostAud: "0.2500" })
    ?.state ?? null

const progress = (s: LatestStep | null, now: Date, taskUpdatedAt = T0) =>
  deriveScreeningProgress({ taskStatus: "SCREENING", taskUpdatedAt, step: s, now })

const version = (s: LatestStep | null, taskUpdatedAt: Date, now = NOW) =>
  progress(s, now, taskUpdatedAt)?.version

describe("deriveScreeningStage (P1-6)", () => {
  it("has no stage for a draft that never ran", () => {
    expect(state("DRAFT", null)).toBeNull()
  })

  it("is queued between Run and the first attempt", () => {
    expect(state("SCREENING", null)).toBe("queued")
  })

  it("follows the attempt row while the worker runs", () => {
    expect(state("SCREENING", step())).toBe("running")
    // Completed but the gate is not mirrored yet: still the worker's.
    expect(state("SCREENING", step({ status: "completed", gateStatus: null }))).toBe("running")
  })

  it("shows a failure until Retry is requested", () => {
    const failed = step({ status: "failed", failureReason: "HTAG_BALANCE_EXHAUSTED" })
    expect(state("SCREENING", failed)).toBe("failed")
    expect(state("SCREENING", failed, new Date(T1.getTime() + 1))).toBe("queued")
  })

  it("is awaiting approval until an approval is requested", () => {
    const awaiting = step({
      status: "completed",
      gateKind: "SCREENING_APPROVAL",
      gateStatus: "awaiting",
    })
    expect(state("SCREENING", awaiting)).toBe("awaiting_approval")
    expect(state("SCREENING", awaiting, new Date(T1.getTime() + 1))).toBe("queued")
  })

  it("is rejected in DRAFT, and queued once Run is pressed again", () => {
    const rejected = step({
      status: "completed",
      gateKind: "SCREENING_APPROVAL",
      gateStatus: "rejected",
    })
    expect(state("DRAFT", rejected)).toBe("rejected")
    expect(state("SCREENING", rejected)).toBe("queued")
  })

  it("is approved once the task has moved past SCREENING", () => {
    expect(state("TREND_ANALYSIS", step({ status: "completed", gateStatus: "approved" }))).toBe(
      "approved",
    )
  })

  it("carries the latest attempt's cost and the total", () => {
    const stage = deriveScreeningStage({
      taskStatus: "SCREENING",
      taskUpdatedAt: T0,
      step: step({ attempt: 3, costAud: "0.7300" }),
      now: NOW,
      totalCostAud: "5.1000",
    })
    expect(stage).toMatchObject({ attempt: 3, costAud: "0.7300", totalCostAud: "5.1000" })
  })

  describe("stalled", () => {
    it("flags a completed attempt whose gate never got mirrored, once the window passes", () => {
      const lost = step({ status: "completed", gateStatus: null })
      expect(progress(lost, later(SCREENING_STALL_AFTER_MS - 1))).toMatchObject({
        state: "running",
        stalled: false,
      })
      expect(progress(lost, later(SCREENING_STALL_AFTER_MS))).toMatchObject({
        state: "running",
        stalled: true,
      })
    })

    it("flags an approval request the worker never finished", () => {
      const awaiting = step({
        status: "completed",
        gateKind: "SCREENING_APPROVAL",
        gateStatus: "awaiting",
      })
      const requested = later(1)
      expect(progress(awaiting, later(SCREENING_STALL_AFTER_MS), requested)).toMatchObject({
        state: "queued",
        stalled: false,
      })
      expect(progress(awaiting, later(SCREENING_STALL_AFTER_MS + 1), requested)).toMatchObject({
        state: "queued",
        stalled: true,
      })
    })

    it("flags a run that never produced an attempt", () => {
      const now = new Date(T0.getTime() + SCREENING_STALL_AFTER_MS)
      expect(progress(null, now)).toMatchObject({ state: "queued", stalled: true })
    })

    it("never flags a stage that is waiting on the user", () => {
      const awaiting = step({
        status: "completed",
        gateKind: "SCREENING_APPROVAL",
        gateStatus: "awaiting",
      })
      const failed = step({ status: "failed", failureReason: "UNEXPECTED" })
      expect(progress(awaiting, later(10 * SCREENING_STALL_AFTER_MS))?.stalled).toBe(false)
      expect(progress(failed, later(10 * SCREENING_STALL_AFTER_MS))?.stalled).toBe(false)
    })
  })

  describe("version", () => {
    it("changes when either row is written, and only then", () => {
      const before = version(step(), T0)
      expect(version(step(), T0)).toBe(before)
      expect(version(step({ updatedAt: later(1) }), T0, later(2))).not.toBe(before)
      expect(version(step(), new Date(T0.getTime() + 1))).not.toBe(before)
    })

    it("changes when the stage stalls, with no write at all", () => {
      const lost = step({ status: "completed", gateStatus: null })
      expect(version(lost, T0, later(SCREENING_STALL_AFTER_MS))).not.toBe(version(lost, T0))
    })
  })
})
