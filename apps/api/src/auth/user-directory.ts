/**
 * The profile fields needed to create a local `users` row. Nothing more —
 * Clerk stays the record of everything else about the identity (D41).
 */
export interface DirectoryUser {
  email: string
  displayName: string | null
}

export interface UserDirectory {
  fetch(externalAuthId: string): Promise<DirectoryUser>
}

/**
 * Reads the profile from Clerk's Backend API at provisioning time (D47).
 *
 * The alternative was a custom JWT template carrying `email` as a claim, which
 * costs nothing per request but moves the token's shape into the Clerk
 * dashboard, where nothing in this repo can assert it is still correct. This
 * call happens once per identity for the lifetime of the account, on the first
 * authenticated request — so the per-request cost of the template approach is
 * an optimisation of something that is already almost never done.
 */
export class ClerkUserDirectory implements UserDirectory {
  constructor(private readonly secretKey: string) {}

  async fetch(externalAuthId: string): Promise<DirectoryUser> {
    const { createClerkClient } = await import("@clerk/backend")
    const client = createClerkClient({ secretKey: this.secretKey })
    const user = await client.users.getUser(externalAuthId)

    const primary = user.emailAddresses.find((address) => address.id === user.primaryEmailAddressId)
    const email = primary?.emailAddress ?? user.emailAddresses[0]?.emailAddress

    if (!email) {
      // `users.email` is NOT NULL with a unique index per tenant. An identity
      // with no address cannot be given a placeholder without colliding with
      // the next one, so this fails loudly instead of inventing a value.
      throw new Error(
        `Clerk user ${externalAuthId} has no email address; cannot provision a local user row.`,
      )
    }

    const displayName = user.fullName ?? [user.firstName, user.lastName].filter(Boolean).join(" ")

    return { email, displayName: displayName.length > 0 ? displayName : null }
  }
}
