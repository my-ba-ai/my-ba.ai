import type { Route } from "next"

/**
 * One step of a page's breadcrumb trail. `href` is a typed route
 * (`typedRoutes`), so a crumb pointing at a page that doesn't exist is a
 * build error. The current page is the last crumb and has no `href`.
 */
export interface Crumb {
  label: string
  href?: Route
}

/** The minimum a task-scoped trail needs. A `PurchaseTaskSummary` satisfies it. */
interface TaskRef {
  id: string
  name: string
}

/**
 * Full trails with every step linked. Each builder extends its parent's, so a
 * route's position in the hierarchy is written once. Not exported: pages use
 * `breadcrumbs`, which unlinks the last step.
 */
const trail = {
  tasks: (): Crumb[] => [{ label: "Tasks", href: "/tasks" }],
  newTask: (): Crumb[] => [...trail.tasks(), { label: "New", href: "/tasks/new" }],
  task: (task: TaskRef): Crumb[] => [
    ...trail.tasks(),
    { label: task.name, href: `/tasks/${task.id}` },
  ],
  taskEdit: (task: TaskRef): Crumb[] => [
    ...trail.task(task),
    { label: "Edit", href: `/tasks/${task.id}/edit` },
  ],
}

/** The last crumb is the page you're on: shown, not linked. */
function current(crumbs: readonly Crumb[]): Crumb[] {
  return crumbs.map((crumb, index) =>
    index === crumbs.length - 1 ? { label: crumb.label } : crumb,
  )
}

/**
 * Breadcrumb factory: one builder per route, used as
 * `<PageHeader breadcrumbs={breadcrumbs.taskEdit(task)} />`. Add a route by
 * adding a `trail` builder that extends its parent, and a matching entry here.
 */
export const breadcrumbs = {
  newTask: () => current(trail.newTask()),
  task: (task: TaskRef) => current(trail.task(task)),
  /** A task page whose task couldn't be loaded: the trail still leads back. */
  taskUnavailable: () => [...trail.tasks(), { label: "Task" }],
  taskEdit: (task: TaskRef) => current(trail.taskEdit(task)),
} satisfies Record<string, (...args: never[]) => Crumb[]>
