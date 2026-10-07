import type { Crumb } from "@/lib/breadcrumbs"
import { type ReactNode, ViewTransition } from "react"
import { PageBreadcrumb } from "./page-breadcrumb"

interface Props {
  title: ReactNode
  /** From the `breadcrumbs` factory (`@/lib/breadcrumbs`). Omit on top-level pages. */
  breadcrumbs?: readonly Crumb[]
  actions?: ReactNode
  /**
   * Shared-element name (D71): the heading morphs from the element with the
   * same name on the previous page, e.g. `taskTitleTransitionName(task.id)`.
   */
  titleTransitionName?: string
}

/** Page title row, with an optional breadcrumb trail above the headline. */
export function PageHeader({ title, breadcrumbs, actions, titleTransitionName }: Readonly<Props>) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 pb-6">
      <div className="min-w-0 space-y-2">
        {breadcrumbs?.length ? <PageBreadcrumb items={breadcrumbs} /> : null}
        {titleTransitionName ? (
          <ViewTransition name={titleTransitionName} share="morph" default="none">
            <h1 className="text-headline text-ink">{title}</h1>
          </ViewTransition>
        ) : (
          <h1 className="text-headline text-ink">{title}</h1>
        )}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  )
}
