/**
 * View transition vocabulary (D71). Types tag a navigation with its direction
 * (`<Link transitionTypes={NAV_FORWARD}>`); `PageTransition` maps them to the
 * slide classes in `globals.css`. Untyped navigations (sidebar, browser
 * back/forward, `router.refresh()`, Server Action redirects) don't slide.
 *
 * Forward = deeper in the hierarchy (list → task → edit). Back = towards the
 * root (breadcrumb ancestors).
 */
export const NAV_FORWARD: string[] = ["nav-forward"]
export const NAV_BACK: string[] = ["nav-back"]

/** Shared-element name pairing a task's title on the list with its detail page heading. */
export const taskTitleTransitionName = (taskId: string) => `task-title-${taskId}`
