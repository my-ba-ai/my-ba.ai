import { clerkAppearance } from "@/lib/clerk-appearance"
import { SignIn } from "@clerk/nextjs"
import { APP_NAME } from "@my-ba/shared"
import type { Metadata } from "next"

export const metadata: Metadata = { title: `Sign in · ${APP_NAME}` }

const VALUE_PROPS = [
  {
    label: "Screen",
    body: "Every Australian suburb scored against your criteria, with the reason for each score.",
  },
  {
    label: "Approve",
    body: "Each analysis stage stops for your approval. Nothing runs past a gate you have not opened.",
  },
  {
    label: "Contact",
    body: "Ranked, registered agents in the suburbs you keep, and a locked record of what you acted on.",
  },
] as const

/**
 * Split layout (docs/07-design-brief.md, Auth). The form column is capped at
 * 400px. The panel on the right is decoration and collapses away below lg.
 *
 * Catch-all route so Clerk can own its sub-steps (second factor, verification,
 * SSO callbacks). There is no sign-up route: this is a single-user MVP, and
 * sign-ups are restricted in the Clerk dashboard, not in code.
 */
export default function SignInPage() {
  return (
    <div className="grid min-h-dvh bg-surface lg:grid-cols-[minmax(440px,1fr)_1.25fr]">
      <main className="flex flex-col px-6 py-10 sm:px-12">
        <div className="flex items-center gap-2">
          <span aria-hidden className="size-5 rounded-[6px] bg-(image:--accent-grad)" />
          <span className="text-[15px] font-semibold tracking-tight text-ink">{APP_NAME}</span>
        </div>
        <div className="mx-auto flex w-full max-w-100 flex-1 flex-col justify-center py-10">
          <SignIn appearance={clerkAppearance} fallbackRedirectUrl="/tasks" />
        </div>
      </main>

      <aside
        aria-label={`About ${APP_NAME}`}
        className="relative overflow-hidden bg-ink px-14 py-16 text-white lg:flex lg:flex-col lg:justify-end"
      >
        {/* Abstract data-viz field: a faint grid and two slow-drifting glows. CSS only. */}
        <div
          aria-hidden
          className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.05)_1px,transparent_1px)] bg-size-[44px_44px]"
        />
        <div
          aria-hidden
          className="absolute inset-[-20%] animate-drift bg-[radial-gradient(40%_35%_at_30%_30%,rgba(14,165,160,.45),transparent_70%),radial-gradient(35%_30%_at_75%_65%,rgba(91,91,214,.4),transparent_70%)]"
        />

        <div className="relative max-w-130 space-y-10">
          <h2 className="text-headline">
            From suburb criteria to agent outreach, with your approval at every step.
          </h2>
          <ul className="space-y-5">
            {VALUE_PROPS.map((prop) => (
              <li key={prop.label} className="grid grid-cols-[88px_1fr] gap-4">
                <span className="pt-0.5 font-data text-micro-lg text-accent-teal uppercase">
                  {prop.label}
                </span>
                <p className="text-body text-white/80">{prop.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  )
}
