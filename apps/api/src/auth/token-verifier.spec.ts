import { beforeEach, describe, expect, it, vi } from "vitest"
import { ClerkTokenVerifier } from "./token-verifier"

const verifyToken = vi.fn()

vi.mock("@clerk/backend", () => ({
  verifyToken: (...args: unknown[]) => verifyToken(...args),
}))

const VALID_PAYLOAD = {
  sub: "user_2abc",
  sid: "sess_1",
  azp: "http://localhost:3000",
  iat: 1,
  exp: 2,
}

describe("ClerkTokenVerifier", () => {
  beforeEach(() => {
    verifyToken.mockReset()
    verifyToken.mockResolvedValue(VALID_PAYLOAD)
  })

  it("returns only the claims this app depends on", async () => {
    verifyToken.mockResolvedValue({ ...VALID_PAYLOAD, org_id: "org_x", v: 2 })

    const claims = await new ClerkTokenVerifier({ jwtKey: "pem" }).verify("token")

    expect(claims).toEqual(VALID_PAYLOAD)
  })

  /**
   * Parse, don't cast. A claim that stops being emitted should fail at the
   * boundary rather than three layers down as an undefined tenant.
   */
  it("rejects a payload with no subject", async () => {
    verifyToken.mockResolvedValue({ iat: 1, exp: 2 })

    await expect(new ClerkTokenVerifier({ jwtKey: "pem" }).verify("token")).rejects.toThrow()
  })

  it("passes the networkless key through when one is configured", async () => {
    await new ClerkTokenVerifier({ jwtKey: "pem" }).verify("token")

    expect(verifyToken).toHaveBeenCalledWith("token", { jwtKey: "pem" })
  })

  /**
   * An option that is present-but-undefined is not the same as absent to every
   * library, and authorizedParties is the one where a silently ignored option
   * means tokens minted for another app on the same instance are accepted.
   */
  it("omits options that were not configured rather than sending undefined", async () => {
    await new ClerkTokenVerifier({ secretKey: "sk", authorizedParties: [] }).verify("token")

    expect(verifyToken).toHaveBeenCalledWith("token", { secretKey: "sk" })
  })

  it("forwards authorized parties when configured", async () => {
    await new ClerkTokenVerifier({
      secretKey: "sk",
      authorizedParties: ["http://localhost:3000"],
    }).verify("token")

    expect(verifyToken).toHaveBeenCalledWith("token", {
      secretKey: "sk",
      authorizedParties: ["http://localhost:3000"],
    })
  })
})
