import { FileText, ListChecks, Settings, Users } from "lucide-react"
import type { NavIcon as NavIconName } from "./nav-items"

const ICONS = { tasks: ListChecks, agents: Users, reports: FileText, settings: Settings } as const

export function NavIcon({ name }: Readonly<{ name: NavIconName }>) {
  const Icon = ICONS[name]
  return <Icon aria-hidden className="size-5" />
}
