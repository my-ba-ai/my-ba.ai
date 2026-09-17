/**
 * DI tokens live here rather than on the module, so the guard and the services
 * can inject them without importing `auth.module.ts` and closing a cycle.
 */

/** Verifies a bearer token and returns its claims. Swapped for a local signer in tests. */
export const TOKEN_VERIFIER = Symbol("TOKEN_VERIFIER")

/** Reads an identity's profile from the auth provider. Called once per user, ever. */
export const USER_DIRECTORY = Symbol("USER_DIRECTORY")
