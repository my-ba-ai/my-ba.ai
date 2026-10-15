import {
  type GateStatus,
  type ScreeningGate,
  type ScreeningJob,
  screeningGateSchema,
  screeningJobSchema,
} from "@my-ba/shared"
import { describe, expect, it } from "vitest"
import { TASK_ID, TENANT_ID, validCriteria } from "../../test/screening-fakes"
import { InvalidGateDecisionError } from "../langgraph-orchestrator"
import type { GateDecision, Orchestrator, StageRef, StageResult } from "../stage"
import { handleScreeningJob, ScreeningJobRejectedError } from "./job"
import type { StageSync } from "./stage-sync"

const USER = "22222222-2222-4333-8444-555555555555"
const STEP = "33333333-2222-4333-8444-555555555555"
const REF: StageRef = { tenantId: TENANT_ID, taskId: TASK_ID, stage: "screening" }

const base = {
  tenantId: TENANT_ID,
  requestedBy: USER,
  requestedAt: new Date().toISOString(),
  taskId: TASK_ID,
}
const runJob: ScreeningJob = screeningJobSchema.parse({ ...base, action: "run" })
const approveJob: ScreeningJob = screeningJobSchema.parse({
  ...base,
  action: "approve",
  keep: ["loc-a"],
})

const gateBase = {
  stage: "screening",
  analysisStepId: STEP,
  attempt: 1,
  criteria: validCriteria(),
  costAud: "1.2300",
}
const approvalGate = (): ScreeningGate =>
  screeningGateSchema.parse({
    ...gateBase,
    kind: "SCREENING_APPROVAL",
    rankedSuburbs: [],
    disabledFactors: [],
    renterCoverage: null,
    droppedAreaIds: [],
  })
const tooBroadGate = (): ScreeningGate =>
  screeningGateSchema.parse({
    ...gateBase,
    kind: "SCREENING_TOO_BROAD",
    returned: 1000,
    limit: 1000,
  })

const awaiting = (gate: ScreeningGate): StageResult => ({ status: "awaiting_approval", gate })

/** Scripted orchestrator: `current` is what getStageResult says; run / resume return `next`. */
function orchestrator(current: StageResult, next: StageResult = current) {
  const calls: { method: string; decision?: GateDecision }[] = []
  const fake: Orchestrator = {
    runStage: async () => {
      calls.push({ method: "runStage" })
      return next
    },
    resumeStage: async (_ref, decision) => {
      calls.push({ method: "resumeStage", decision })
      return next
    },
    getStageResult: async () => current,
    close: async () => undefined,
  }
  return { fake, calls }
}

function sync(gateStatus: GateStatus | null = "awaiting") {
  const writes: { method: string; input: unknown }[] = []
  const fake: StageSync = {
    gateStatus: async () => gateStatus,
    latestStepId: async () => STEP,
    awaiting: async (_tenant, gate) => {
      writes.push({ method: "awaiting", input: gate.analysisStepId })
      return true
    },
    approved: async (input) => {
      writes.push({ method: "approved", input })
      return { gateRecorded: true, statusChanged: true }
    },
  }
  return { fake, writes }
}

const handle = (o: Orchestrator, s: StageSync, job: ScreeningJob) =>
  handleScreeningJob({ orchestrator: o, sync: s }, job)

describe("handleScreeningJob run (P1-6)", () => {
  it("starts the stage and mirrors the gate it pauses at", async () => {
    const o = orchestrator({ status: "not_started" }, awaiting(approvalGate()))
    const s = sync()
    const result = await handle(o.fake, s.fake, runJob)
    expect(o.calls).toEqual([{ method: "runStage" }])
    expect(s.writes).toEqual([{ method: "awaiting", input: STEP }])
    expect(result.status).toBe("awaiting_approval")
  })

  it.each([
    ["approval", approvalGate],
    ["too-broad", tooBroadGate],
  ])("resumes a rejected %s gate with approved: false (D75, AC 6)", async (_label, gate) => {
    const o = orchestrator(awaiting(gate()), { status: "not_started" })
    await handle(o.fake, sync("rejected").fake, runJob)
    expect(o.calls).toEqual([{ method: "resumeStage", decision: { approved: false } }])
  })

  it("leaves a gate still awaiting the user alone", async () => {
    const o = orchestrator(awaiting(approvalGate()))
    const s = sync("awaiting")
    const result = await handle(o.fake, s.fake, runJob)
    expect(o.calls).toEqual([])
    expect(s.writes).toEqual([{ method: "awaiting", input: STEP }])
    expect(result.status).toBe("awaiting_approval")
  })

  it("retries a failed stage through runStage and returns the failure as a result", async () => {
    const failed: StageResult = {
      status: "failed",
      error: "screen: x",
      reason: "HTAG_QUOTA_EXCEEDED",
    }
    const o = orchestrator(failed)
    const s = sync()
    await expect(handle(o.fake, s.fake, runJob)).resolves.toEqual(failed)
    expect(o.calls).toEqual([{ method: "runStage" }])
    expect(s.writes).toEqual([])
  })

  it("finishes a lost approval sync when the thread already completed (stalled Retry)", async () => {
    const o = orchestrator({ status: "completed", output: { approved: true, items: ["loc-a"] } })
    const s = sync()
    const result = await handle(o.fake, s.fake, runJob)
    expect(o.calls).toEqual([])
    expect(s.writes).toEqual([
      {
        method: "approved",
        input: {
          tenantId: TENANT_ID,
          taskId: TASK_ID,
          analysisStepId: STEP,
          decision: { approved: true, keep: ["loc-a"] },
          decidedBy: null,
        },
      },
    ])
    expect(result.status).toBe("completed")
  })

  it("refuses a gate that isn't a screening gate", async () => {
    const o = orchestrator({
      status: "awaiting_approval",
      gate: { kind: "approval", stage: "spike", summary: "x", items: [] },
    })
    await expect(handle(o.fake, sync().fake, runJob)).rejects.toBeInstanceOf(
      ScreeningJobRejectedError,
    )
  })
})

describe("handleScreeningJob approve (P1-6)", () => {
  it("resumes with approved: true and records the approval on completion", async () => {
    const o = orchestrator(awaiting(approvalGate()), {
      status: "completed",
      output: { approved: true, items: ["loc-a"] },
    })
    const s = sync()
    const result = await handle(o.fake, s.fake, approveJob)
    expect(o.calls).toEqual([
      { method: "resumeStage", decision: { approved: true, keep: ["loc-a"] } },
    ])
    expect(s.writes).toEqual([
      {
        method: "approved",
        input: {
          tenantId: TENANT_ID,
          taskId: TASK_ID,
          analysisStepId: STEP,
          decision: { approved: true, keep: ["loc-a"] },
          decidedBy: USER,
        },
      },
    ])
    expect(result.status).toBe("completed")
  })

  it("finishes the sync when redelivered after the stage already completed", async () => {
    const o = orchestrator({ status: "completed", output: { approved: true, items: [] } })
    const s = sync()
    await handle(o.fake, s.fake, approveJob)
    expect(o.calls).toEqual([])
    expect(s.writes.map((w) => w.method)).toEqual(["approved"])
  })

  it("refuses a too-broad gate (no approve, D42)", async () => {
    const o = orchestrator(awaiting(tooBroadGate()))
    await expect(handle(o.fake, sync().fake, approveJob)).rejects.toBeInstanceOf(
      ScreeningJobRejectedError,
    )
    expect(o.calls).toEqual([])
  })

  it("turns a decision the gate cannot take into a rejected job", async () => {
    const o = orchestrator(awaiting(approvalGate()))
    o.fake.resumeStage = async () => {
      throw new InvalidGateDecisionError(REF, "SCREENING_APPROVAL")
    }
    await expect(handle(o.fake, sync().fake, approveJob)).rejects.toBeInstanceOf(
      ScreeningJobRejectedError,
    )
  })

  it("refuses when the stage is not paused at all", async () => {
    const o = orchestrator({ status: "not_started" })
    await expect(handle(o.fake, sync().fake, approveJob)).rejects.toBeInstanceOf(
      ScreeningJobRejectedError,
    )
  })
})
