import { TriangleAlert } from "lucide-react"
import { API_FAILURE_SUMMARY, type ApiFailure } from "@/lib/api-failure"

/**
 * Error state (design-system.md §4): name the failing link, say that nothing
 * was written, and show the raw line. Read-only screens have nothing to roll
 * back, but saying so is still the point: an error should not leave you
 * wondering what it did.
 */
export function ApiFailurePanel({
  failure,
  what,
}: Readonly<{ failure: ApiFailure; what: string }>) {
  return (
    <section
      role="alert"
      className="space-y-3 rounded-2xl border border-neg-border bg-neg-bg px-6 py-5"
    >
      <div className="flex items-center gap-2 text-neg">
        <TriangleAlert aria-hidden className="size-4" />
        <h2 className="text-sm font-semibold">Could not load {what}</h2>
        <span className="ml-auto font-data text-micro-lg uppercase">
          {failure.stage}
          {failure.status ? ` · ${failure.status}` : ""}
        </span>
      </div>
      <p className="text-body-sm text-ink-2">
        {API_FAILURE_SUMMARY[failure.stage]} Nothing was changed. Reload the page to try again.
      </p>
      <pre className="overflow-x-auto rounded-md border border-neg-border bg-surface px-3 py-2 font-mono text-body-sm whitespace-pre-wrap text-ink-3">
        {failure.detail}
      </pre>
    </section>
  )
}
