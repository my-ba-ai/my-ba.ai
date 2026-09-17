import { sessionClaimsSchema, type SessionClaims } from "@my-ba/shared"

/**
 * Everything the app needs from Clerk's token handling, which is not much.
 *
 * The interface exists so the guard never imports `@clerk/backend` directly.
 * That matters twice: the test suite signs its own RS256 tokens and verifies
 * them through the real library (see token-verifier.spec.ts), and D41's promise
 * that the provider can be swapped without touching foreign keys is only true
 * if the provider is also swappable in code.
 */
export interface TokenVerifier {
  verify(token: string): Promise<SessionClaims>
}

export interface ClerkVerifierOptions {
  /**
   * Clerk's PEM public key. When present, verification is networkless — no JWKS
   * fetch on the request path, which is the difference between an auth check
   * that is microseconds and one that is a network hop with its own failure
   * mode. Prefer it in every deployed environment.
   */
  jwtKey?: string
  /** Falls back to a JWKS fetch keyed by the instance. Fine for local dev. */
  secretKey?: string
  /**
   * Origins allowed to have minted this token. Without it, a token issued for
   * a different application on the same Clerk instance is accepted here.
   */
  authorizedParties?: string[]
}

/**
 * NOTE when the Clerk dependency is first installed: confirm the option names
 * below against the installed `@clerk/backend` version's types before trusting
 * this comment. `verifyToken` has been stable, but the package has renamed
 * options across majors and a silently-ignored option here means a check that
 * looks configured and is not — `authorizedParties` above being the one that
 * would hurt.
 */
export class ClerkTokenVerifier implements TokenVerifier {
  constructor(private readonly options: ClerkVerifierOptions) {}

  async verify(token: string): Promise<SessionClaims> {
    const { verifyToken } = await import("@clerk/backend")

    const payload = await verifyToken(token, {
      ...(this.options.jwtKey ? { jwtKey: this.options.jwtKey } : {}),
      ...(this.options.secretKey ? { secretKey: this.options.secretKey } : {}),
      ...(this.options.authorizedParties?.length
        ? { authorizedParties: this.options.authorizedParties }
        : {}),
    })

    // Parse, don't cast. The library's return type is wider than what this app
    // depends on, and a claim that stopped being emitted should fail here
    // rather than three layers down as an undefined tenant.
    return sessionClaimsSchema.parse(payload)
  }
}
