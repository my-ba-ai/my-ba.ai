import { type Job, UnrecoverableError } from "bullmq"
import { diagnosticsJobResultSchema } from "@my-ba/shared"
import { describe, expect, it } from "vitest"
import { DiagnosticsProcessor } from "./diagnostics.processor"

function job(data: unknown): Job {
  return { id: "1", name: "ping", data, attemptsMade: 0 } as unknown as Job
}

describe("DiagnosticsProcessor", () => {
  const processor = new DiagnosticsProcessor()

  it("processes a valid payload and returns a schema-valid result", async () => {
    const result = await processor.process(
      job({
        tenantId: "99999999-2222-4333-8444-555555555555",
        requestedBy: "11111111-2222-4333-8444-555555555555",
        requestedAt: new Date().toISOString(),
        message: "hello",
      }),
    )

    expect(diagnosticsJobResultSchema.safeParse(result).success).toBe(true)
  })

  it("rejects a payload without a tenant as unrecoverable", async () => {
    await expect(
      processor.process(
        job({ requestedBy: null, requestedAt: new Date().toISOString(), message: "x" }),
      ),
    ).rejects.toBeInstanceOf(UnrecoverableError)
  })
})
