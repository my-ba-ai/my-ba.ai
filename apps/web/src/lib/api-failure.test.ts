import { describe, expect, it, vi } from "vitest"
import { ApiContractError, ApiError, ApiUnreachableError } from "./api-client"
import { classifyApiError } from "./api-failure"

vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn() }))

describe("classifyApiError", () => {
  it("names an unreachable API", () => {
    const failure = classifyApiError(
      new ApiUnreachableError("http://localhost:3001/api/x", new Error("ECONNREFUSED")),
    )
    expect(failure).toMatchObject({ stage: "unreachable", status: null })
    expect(failure.detail).toContain("ECONNREFUSED")
  })

  it("keeps the status of a refusal", () => {
    expect(classifyApiError(new ApiError(401, "", "GET /x -> 401"))).toMatchObject({
      stage: "api",
      status: 401,
    })
  })

  it("separates a contract mismatch from a refusal", () => {
    expect(classifyApiError(new ApiContractError("{}", "did not match"))).toMatchObject({
      stage: "contract",
    })
  })

  it("falls back to unknown for anything else", () => {
    expect(classifyApiError(new TypeError("boom"))).toEqual({
      stage: "unknown",
      status: null,
      detail: "TypeError: boom",
    })
  })
})
