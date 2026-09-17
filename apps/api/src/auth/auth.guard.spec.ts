import type { ExecutionContext } from "@nestjs/common"
import { UnauthorizedException } from "@nestjs/common"
import type { Reflector } from "@nestjs/core"
import { describe, expect, it, vi } from "vitest"
import { AuthGuard } from "./auth.guard"
import type { AuthenticatedRequest } from "./authenticated-request"
import type { IdentityResolverService, ResolvedIdentity } from "./identity-resolver.service"
import type { TokenVerifier } from "./token-verifier"

const RESOLVED: ResolvedIdentity = {
  userId: "11111111-2222-4333-8444-555555555555",
  tenantId: "99999999-2222-4333-8444-555555555555",
  email: "brian@example.com",
  displayName: "Brian Liu",
  role: "investor",
  provisioned: false,
}

function contextFor(request: Partial<AuthenticatedRequest>): {
  context: ExecutionContext
  request: AuthenticatedRequest
} {
  const full = { headers: {}, ...request } as AuthenticatedRequest
  const context = {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => full }),
  } as unknown as ExecutionContext
  return { context, request: full }
}

function build(options: {
  isPublic?: boolean
  verify?: TokenVerifier["verify"]
  resolve?: IdentityResolverService["resolve"]
}) {
  const reflector = {
    getAllAndOverride: () => options.isPublic ?? false,
  } as unknown as Reflector

  const verifier: TokenVerifier = {
    verify:
      options.verify ??
      vi.fn(async () => ({ sub: "user_2abc", sid: "sess_1", iat: 0, exp: 0 })),
  }

  const identities = {
    resolve: options.resolve ?? vi.fn(async () => RESOLVED),
  } as unknown as IdentityResolverService

  return new AuthGuard(reflector, verifier, identities)
}

describe("AuthGuard", () => {
  it("lets a @Public() route through without a token", async () => {
    const guard = build({ isPublic: true })
    const { context, request } = contextFor({})

    await expect(guard.canActivate(context)).resolves.toBe(true)
    expect(request.auth).toBeUndefined()
  })

  it("rejects a request with no Authorization header", async () => {
    const guard = build({})
    const { context } = contextFor({})

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException)
  })

  it.each([
    ["the wrong scheme", { authorization: "Basic abc123" }],
    ["a scheme with no value", { authorization: "Bearer" }],
    ["an empty value", { authorization: "Bearer   " }],
  ])("rejects %s", async (_label, headers) => {
    const guard = build({})
    const { context } = contextFor({ headers: headers as AuthenticatedRequest["headers"] })

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException)
  })

  it("accepts a lowercase bearer scheme", async () => {
    const guard = build({})
    const { context } = contextFor({
      headers: { authorization: "bearer token" } as AuthenticatedRequest["headers"],
    })

    await expect(guard.canActivate(context)).resolves.toBe(true)
  })

  /**
   * Whether a token was malformed, expired or minted for another party is
   * useful in a log and is free reconnaissance in a response body.
   */
  it("does not leak why verification failed", async () => {
    const guard = build({
      verify: async () => {
        throw new Error("jwk-kid-mismatch: no matching key for kid ins_abc123")
      },
    })
    const { context } = contextFor({
      headers: { authorization: "Bearer bad" } as AuthenticatedRequest["headers"],
    })

    await expect(guard.canActivate(context)).rejects.toThrow("Invalid or expired session token")
    await expect(guard.canActivate(context)).rejects.not.toThrow(/kid/)
  })

  it("attaches the resolved identity to the request", async () => {
    const guard = build({})
    const { context, request } = contextFor({
      headers: { authorization: "Bearer good" } as AuthenticatedRequest["headers"],
    })

    await guard.canActivate(context)

    expect(request.auth).toEqual({
      externalAuthId: "user_2abc",
      sessionId: "sess_1",
      userId: RESOLVED.userId,
      tenantId: RESOLVED.tenantId,
      email: RESOLVED.email,
      displayName: RESOLVED.displayName,
      role: RESOLVED.role,
      provisioned: false,
    })
  })

  /**
   * The tenant comes from the resolver, which read it from the database. A
   * request that names its own tenant is the failure mode RLS exists to stop,
   * so nothing the client sent may reach the auth context.
   */
  it("ignores a tenant supplied by the client", async () => {
    const guard = build({})
    const { context, request } = contextFor({
      headers: {
        authorization: "Bearer good",
        "x-tenant-id": "00000000-0000-0000-0000-00000000dead",
      } as AuthenticatedRequest["headers"],
    })

    await guard.canActivate(context)

    expect(request.auth?.tenantId).toBe(RESOLVED.tenantId)
  })

  it("surfaces a session id of null when the token carries none", async () => {
    const guard = build({
      verify: async () => ({ sub: "user_2abc", iat: 0, exp: 0 }),
    })
    const { context, request } = contextFor({
      headers: { authorization: "Bearer good" } as AuthenticatedRequest["headers"],
    })

    await guard.canActivate(context)

    expect(request.auth?.sessionId).toBeNull()
  })
})
