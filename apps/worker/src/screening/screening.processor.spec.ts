import { type Job, UnrecoverableError } from "bullmq"
import type { Orchestrator, StageRef, StageResult } from "@my-ba/orchestrator"
import { describe, expect, it } from "vitest"
import { ScreeningProcessor } from "./screening.processor"

const TENANT = "99999999-2222-4333-8444-555555555555"
const TASK = "11111111-2222-4333-8444-555555555555"

function job(data: unknown): Job {
  return { id: "1", name: "run", data, attemptsMade: 0 } as unknown as Job
}

const payload = {
  tenantId: TENANT,
  requestedBy: null,
  requestedAt: new Date().toISOString(),
  taskId: TASK,
}

function orchestrator(result: StageResult) {
  const calls: StageRef[] = []
  const fake: Orchestrator = {
    runStage: async (ref) => {
      calls.push(ref)
      return result
    },
    resumeStage: async () => result,
    getStageResult: async () => result,
    close: async () => undefined,
  }
  return { fake, calls }
}

describe("ScreeningProcessor (P1-4)", () => {
  it("runs the screening stage for the payload's tenant and task", async () => {
    const { fake, calls } = orchestrator({ status: "not_started" })
    const result = await new ScreeningProcessor(fake).process(job(payload))
    expect(calls).toEqual([{ tenantId: TENANT, taskId: TASK, stage: "screening" }])
    expect(result).toEqual({ status: "not_started" })
  })

  it("reports the gate it paused at", async () => {
    const { fake } = orchestrator({
      status: "awaiting_approval",
      gate: { kind: "approval", stage: "spike", summary: "x", items: [] },
    })
    expect(await new ScreeningProcessor(fake).process(job(payload))).toEqual({
      status: "awaiting_approval",
      gate: "approval",
    })
  })

  it("a failed stage is unrecoverable for BullMQ and carries the typed reason", async () => {
    const { fake } = orchestrator({
      status: "failed",
      error: "screen: [HTAG_QUOTA_EXCEEDED] cap",
      reason: "HTAG_QUOTA_EXCEEDED",
    })
    const error = await new ScreeningProcessor(fake).process(job(payload)).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(UnrecoverableError)
    expect((error as Error).message).toMatch(/HTAG_QUOTA_EXCEEDED/)
  })

  it("rejects a payload without a task as unrecoverable, without running anything", async () => {
    const { fake, calls } = orchestrator({ status: "not_started" })
    await expect(
      new ScreeningProcessor(fake).process(job({ ...payload, taskId: undefined })),
    ).rejects.toBeInstanceOf(UnrecoverableError)
    expect(calls).toEqual([])
  })
})
