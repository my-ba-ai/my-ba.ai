import Link from "next/link"

/**
 * Shown for a malformed id, a task that does not exist, and a task in another
 * tenant. The three are deliberately indistinguishable.
 */
export default function TaskNotFound() {
  return (
    <section className="mx-auto mt-10 max-w-140 space-y-3 rounded-2xl border border-border-panel bg-surface px-8 py-9 text-center shadow-panel">
      <p className="font-data text-micro-lg text-ink-dim uppercase">404</p>
      <h1 className="text-section text-ink">Task not found</h1>
      <p className="text-body-sm text-ink-muted">
        No purchase task with this id is visible to your account.
      </p>
      <Link
        href="/tasks"
        className="inline-block rounded-md border border-border-strong bg-surface px-4 py-2 text-value font-medium text-ink-3 hover:border-accent-alt"
      >
        Back to tasks
      </Link>
    </section>
  )
}
