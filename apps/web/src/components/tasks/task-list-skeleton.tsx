/**
 * Loading state: shimmer rows shaped like `TaskCard`, plus a data progress line
 * (design-system.md §4). Uses the `shim` animation, not the vendored Skeleton's
 * `animate-pulse`, which §5 does not allow.
 */
const shimmer =
  "rounded-md bg-[linear-gradient(90deg,var(--surface-inset)_0%,var(--border-soft)_50%,var(--surface-inset)_100%)] bg-size-[200%_100%] animate-shim"

export function TaskListSkeleton({ rows = 3 }: Readonly<{ rows?: number }>) {
  return (
    <div aria-busy="true" aria-live="polite" className="space-y-1.75">
      <p className="pb-2 font-data text-body-sm text-ink-muted">Loading purchase tasks…</p>
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-6 rounded-xl border border-border-card bg-surface px-4.5 py-3.5 md:grid-cols-[minmax(0,1fr)_auto_auto]"
        >
          <div className="space-y-2">
            <div className={`h-3.5 w-56 max-w-full ${shimmer}`} />
            <div className={`h-3 w-36 ${shimmer}`} />
          </div>
          <div className={`h-1.5 w-40 max-md:hidden ${shimmer}`} />
          <div className={`h-6 w-24 rounded-4xl ${shimmer}`} />
        </div>
      ))}
    </div>
  )
}
