/**
 * docs/03-domain-model.md — Users.role.
 *
 * Owned here rather than in `@my-ba/db` for the reason stated at the top of
 * that package's `enums.ts`: enum values belong to the shared contract, and the
 * pgEnum is a consumer of them. The API needs this list too, to type the role
 * on a resolved auth context, and two copies would drift.
 */
export const USER_ROLES = ["investor", "agent", "admin"] as const

export type UserRole = typeof USER_ROLES[number]

/** What a just-provisioned identity gets (D45). Agent and admin are granted, never claimed. */
export const DEFAULT_USER_ROLE: UserRole = "investor"
