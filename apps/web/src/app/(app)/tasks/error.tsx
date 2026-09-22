"use client"

/**
 * Last resort. Expected API failures are rendered by the page itself with
 * their stage; this catches a render bug. In production `error.message` is
 * stripped by Next, so the digest is what links this screen to the server log.
 */
export default function TasksError({
  error,
  reset,
}: Readonly<{ error: Error & { digest?: string }; reset: () => void }>) {
  return (
    <section
      role="alert"
      className="space-y-3 rounded-2xl border border-neg-border bg-neg-bg px-6 py-5"
    >
      <h2 className="text-sm font-semibold text-neg">This page failed to render</h2>
      <p className="text-body-sm text-ink-2">
        Nothing was changed. The server log has the full error
        {error.digest ? (
          <>
            {" "}
            under digest <code className="font-data">{error.digest}</code>
          </>
        ) : null}
        .
      </p>
      <button
        type="button"
        onClick={reset}
        className="rounded-md border border-border-strong bg-surface px-4 py-2 text-value font-medium text-ink-3 hover:border-accent-alt"
      >
        Try again
      </button>
    </section>
  )
}
