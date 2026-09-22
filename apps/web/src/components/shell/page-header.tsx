import type { ReactNode } from "react"

/** Page title row. `eyebrow` sits above the headline (breadcrumb on detail pages). */
export function PageHeader({
  title,
  eyebrow,
  actions,
}: Readonly<{ title: ReactNode; eyebrow?: ReactNode; actions?: ReactNode }>) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 pb-6">
      <div className="min-w-0 space-y-1.5">
        {eyebrow}
        <h1 className="text-headline text-ink">{title}</h1>
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  )
}
