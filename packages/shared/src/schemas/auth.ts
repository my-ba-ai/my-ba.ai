import { z } from "zod"
import { USER_ROLES } from "../domain/user-role"

/**
 * The part of a Clerk session-token payload this app actually depends on.
 *
 * Deliberately not the whole payload. Clerk adds and moves claims between
 * versions, and parsing only what is used means a claim appearing or vanishing
 * upstream cannot break a request that never read it. Everything here is
 * present in a default session token — no JWT template is configured, and none
 * should be needed (D47).
 *
 * `email` is absent on purpose: the default session token does not carry it,
 * and provisioning fetches it from the Clerk Backend API once per identity
 * instead of depending on dashboard-side template config.
 */
export const sessionClaimsSchema = z.object({
  /** Clerk user id. Stored as `users.external_auth_id`. */
  sub: z.string().min(1),
  /** Clerk session id. Logged, never trusted for authorisation. */
  sid: z.string().min(1).optional(),
  /** Authorised party — the origin the token was minted for. */
  azp: z.string().min(1).optional(),
  iat: z.number().int(),
  exp: z.number().int(),
})

export type SessionClaims = z.infer<typeof sessionClaimsSchema>

/**
 * A verified identity joined to its local tenant. Built once per request by the
 * auth guard and attached to the request object; everything downstream reads it
 * rather than re-deriving it from the token.
 *
 * `tenantId` here is the value that goes into `withTenant`. Nothing else in the
 * request may supply it — not a header, not a path parameter, not a body field.
 * That is the entire point of resolving it from a signature-verified token.
 */
export const authContextSchema = z.object({
  externalAuthId: z.string().min(1),
  userId: z.uuid(),
  tenantId: z.uuid(),
  email: z.email(),
  displayName: z.string().nullable(),
  role: z.enum([...USER_ROLES]),
  sessionId: z.string().min(1).nullable(),
  /**
   * True when this request is the one that created the tenant and user rows.
   * Request metadata rather than a property of the identity, but it belongs to
   * the same resolution step and threading it separately buys nothing.
   */
  provisioned: z.boolean(),
})

export type AuthContext = z.infer<typeof authContextSchema>

/**
 * `GET /api/auth/me`. The proof that P0-3 works end to end: it is reachable
 * only with a valid token, and every field in it was read back through a
 * tenant-scoped transaction rather than echoed from the token.
 */
export const currentUserResponseSchema = z.object({
  userId: z.uuid(),
  tenantId: z.uuid(),
  email: z.email(),
  displayName: z.string().nullable(),
  role: z.enum([...USER_ROLES]),
  /**
   * True when this identity's rows were created during this request rather than
   * found. Useful once, on the first sign-in, and worth surfacing while JIT
   * provisioning (D45) is young enough to want confirming.
   */
  provisioned: z.boolean(),
})

export type CurrentUserResponse = z.infer<typeof currentUserResponseSchema>
