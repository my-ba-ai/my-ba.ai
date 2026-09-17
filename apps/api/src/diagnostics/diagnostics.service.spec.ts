import type { AuthContext } from "@my-ba/shared"
import type { Queue } from "bullmq"
import { describe, expect, it, vi } from "vitest"
import { DIAGNOSTICS_JOB_NAME, DiagnosticsService } from "./diagnostics.service"

const AUTH: AuthContext = {
  externalAuthId: "user_2abc",
  userId: "11111111-2222-4333-8444-555555555555",
  tenantId: "99999999-2222-4333-8444-555555555555",
  email: "brian@example.com",
  displayName: "Brian Liu",
  role: "investor",
  sessionId: "sess_1",
  provisioned: false,
}

function fakeQueue(jobId: string | undefined) {
  const add = vi.fn(async () => ({ id: jobId }))
  return { queue: { name: "diagnostics", add } as unknown as Queue, add }
}

describe("DiagnosticsService", () => {
  it("enqueues a payload whose tenant comes from the auth context", async () => {
    const { queue, add } = fakeQueue("42")
    const service = new DiagnosticsService(queue)

    const response = await service.enqueue(AUTH, { message: "hello" })

    expect(response).toEqual({ jobId: "42", queue: "diagnostics" })
    expect(add).toHaveBeenCalledWith(
      DIAGNOSTICS_JOB_NAME,
      expect.objectContaining({
        tenantId: AUTH.tenantId,
        requestedBy: AUTH.userId,
        message: "hello",
      }),
    )
  })

  it("fails loudly when BullMQ returns no id", async () => {
    const { queue } = fakeQueue(undefined)
    await expect(new DiagnosticsService(queue).enqueue(AUTH, { message: "x" })).rejects.toThrow(
      /without an id/,
    )
  })
})
