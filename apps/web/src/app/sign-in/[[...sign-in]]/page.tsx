import { SignIn } from "@clerk/nextjs"

/**
 * Catch-all so Clerk can own its own sub-routes (factor two, verification,
 * SSO callbacks) without a route file per step.
 */
export default function SignInPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-6 py-16">
      <SignIn />
    </main>
  )
}
