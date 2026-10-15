import { type Job, UnrecoverableError } from "bullmq"
import type { Orchestrator, StageResult, StageSync } from "@my-ba/orchestrator"
import { describe, expect, it } from "vitest"
import { ScreeningProcessor } from "./screening.processor"

/**
 * The BullMQ adapter only: payload parsing and error mapping. What a job
 * does is `handleScreeningJob`, tested in `@my-ba/orchestrator`.
 */
const TENANT = "99999999-2222-4333-8444-555555555555"
const TASK = "11111111-2222-4333-8444-555555555555"

function job(data: unknown): Job {
  return { id: "1", name: "run", data, attemptsMade: 0 } as unknown as Job
}

const runPayload = {
  tenantId: TENANT,
  requestedBy: null,
  requestedAt: new Date().toISOString(),
  taskId: TASK,
  action: "run",
}

function orchestrator(result: StageResult) {
  let calls = 0
  const fake: Orchestrator = {
    runStage: async () => {
      calls += 1
      return result
    },
    resumeStage: async () => result,
    getStageResult: async () => result,
    close: async () => undefined,
  }
  return { fake, calls: () => calls }
}

const sync: StageSync = {
  gateStatus: async () => null,
  latestStepId: async () => null,
  awaiting: async () => true,
  approved: async () => ({ gateRecorded: true, statusChanged: true }),
}

describe("ScreeningProcessor (P1-4, P1-6)", () => {
  it("runs the job and reports the result", async () => {
    const o = orchestrator({ status: "incomplete", next: ["screen"] })
    const result = await new ScreeningProcessor(o.fake, sync).process(job(runPayload))
    expect(o.calls()).toBe(1)
    expect(result).toEqual({ action: "run", status: "incomplete" })
  })

  it("a failed stage is unrecoverable for BullMQ and carries the typed reason", async () => {
    const o = orchestrator({
      status: "failed",
      error: "screen: [HTAG_QUOTA_EXCEEDED] cap",
      reason: "HTAG_QUOTA_EXCEEDED",
    })
    const error = await new ScreeningProcessor(o.fake, sync)
      .process(job(runPayload))
      .catch((e: unknown) => e)
    expect(error).toBeInstanceOf(UnrecoverableError)
    expect((error as Error).message).toMatch(/HTAG_QUOTA_EXCEEDED/)
  })

  it("maps a rejected job (approve with nothing to approve) to unrecoverable", async () => {
    const o = orchestrator({ status: "not_started" })
    await expect(
      new ScreeningProcessor(o.fake, sync).process(job({ ...runPayload, action: "approve" })),
    ).rejects.toBeInstanceOf(UnrecoverableError)
  })

  it("rejects a payload without an action or task as unrecoverable, without running anything", async () => {
    const o = orchestrator({ status: "not_started" })
    const { action: _action, ...noAction } = runPayload
    await expect(
      new ScreeningProcessor(o.fake, sync).process(job(noAction)),
    ).rejects.toBeInstanceOf(UnrecoverableError)
    await expect(
      new ScreeningProcessor(o.fake, sync).process(job({ ...runPayload, taskId: undefined })),
    ).rejects.toBeInstanceOf(UnrecoverableError)
    expect(o.calls()).toBe(0)
  })
})
