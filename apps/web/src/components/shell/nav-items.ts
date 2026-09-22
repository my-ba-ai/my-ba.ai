import type { Route } from "next"

/**
 * Sidebar destinations (docs/07-design-brief.md, Task List). Items for phases
 * that have not shipped are listed with the phase that delivers them and
 * rendered disabled, so the shell shows where the product is going without
 * shipping a single dead route.
 */
export type NavItem =
  | { label: string; href: Route; icon: NavIcon }
  | { label: string; availableIn: string; icon: NavIcon }

export type NavIcon = "tasks" | "agents" | "reports" | "settings"

export const NAV_ITEMS: readonly NavItem[] = [
  { label: "Tasks", href: "/tasks", icon: "tasks" },
  { label: "Agents", availableIn: "Phase 4", icon: "agents" },
  { label: "Reports", availableIn: "Phase 2", icon: "reports" },
  { label: "Settings", availableIn: "Phase 2", icon: "settings" },
]
