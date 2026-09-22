import Link from "next/link"
import { auth } from "@clerk/nextjs/server"
import { APP_NAME, currentUserResponseSchema, TASK_STATUS_ORDER } from "@my-ba/shared"
import { PipelineOutline } from "@/components/pipeline-outline"
import { ApiContractError, ApiError, ApiUnreachableError, apiFetch } from "@/lib/api-client"

/**
 * Dev diagnostic at /dev/whoami (was the home page until P0-6). It walks the
 * P0-3 chain end to end — Clerk session, bearer token, Nest guard,
 * tenant-scoped read — and is the first place to look when /tasks errors.
 *
 * It reports *which* link in that chain broke rather than collapsing every
 * failure into a blank page. A signed-in session that renders as anonymous and
 * an API returning 401 are different bugs in different processes, and a page
 * that cannot tell them apart makes you go looking in both.
 */
const STAGE_SUMMARY: Record<string, string> = {
  unreachable:
    "The API did not answer — is apps/api running, and on the port NEXT_PUBLIC_API_URL points at?",
  api: "The API answered and refused. Its terminal has the AuthGuard warning with the real reason.",
  contract: "The API answered 2xx with a body this client could not accept.",
  unknown: "Something else failed before the response could be read.",
}

async function loadIdentity() {
  const { userId, sessionId } = await auth()

  if (!userId) {
    return {
      ok: false as const,
      stage: "clerk" as const,
      detail:
        "auth() returned no userId. The session is not reaching the server — check that proxy.ts ran for this request.",
    }
  }

  try {
    const identity = await apiFetch("/auth/me", currentUserResponseSchema)
    return { ok: true as const, identity, sessionId }
  } catch (error: unknown) {
    if (error instanceof ApiUnreachableError) {
      return { ok: false as const, stage: "unreachable" as const, detail: error.message }
    }
    if (error instanceof ApiError) {
      return { ok: false as const, stage: "api" as const, detail: error.message }
    }
    if (error instanceof ApiContractError) {
      return {
        ok: false as const,
        stage: "contract" as const,
        detail: `${error.message}\n\nRaw body: ${error.body.slice(0, 500)}`,
      }
    }
    return {
      ok: false as const,
      stage: "unknown" as const,
      detail: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    }
  }
}

export default async function WhoAmIPage() {
  const result = await loadIdentity()

  if (!result.ok) {
    // Server-side: the full object, including a Zod issue list if that is what
    // went wrong. The browser gets the summary below.
    console.error(`[P0-3] identity check failed at stage "${result.stage}":`, result.detail)
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col justify-center gap-8 px-6 py-16">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">{APP_NAME}</h1>

        {result.ok ? (
          <p className="text-neutral-600">
            Signed in as <span className="font-medium">{result.identity.email}</span> · tenant{" "}
            <code className="text-xs">{result.identity.tenantId}</code>
            {result.identity.provisioned ? " (created just now)" : null}
          </p>
        ) : result.stage === "clerk" ? (
          <p className="text-neutral-600">
            No session.{" "}
            <Link href="/sign-in" className="underline underline-offset-4">
              Sign in
            </Link>
            .
          </p>
        ) : (
          <div className="space-y-1 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm">
            <p className="font-medium">Clerk session is fine. {STAGE_SUMMARY[result.stage]}</p>
            <pre className="whitespace-pre-wrap wrap-break-word text-neutral-700">
              {result.detail}
            </pre>
          </div>
        )}
      </header>
      <PipelineOutline stages={TASK_STATUS_ORDER} />
    </main>
  )
}
