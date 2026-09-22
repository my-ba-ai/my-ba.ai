import { UserButton } from "@clerk/nextjs"
import { APP_NAME } from "@my-ba/shared"
import Link from "next/link"
import { SidebarNav } from "./sidebar-nav"

export function AppSidebar() {
  return (
    <aside className="flex h-dvh w-60 shrink-0 flex-col border-r border-border-panel bg-surface-sunk px-3 py-5 max-md:hidden">
      <Link href="/tasks" className="mb-7 flex items-center gap-2 px-3">
        {/* The one identity mark allowed the accent gradient (design-system.md §1). */}
        <span aria-hidden className="size-5 rounded-[6px] bg-(image:--accent-grad)" />
        <span className="text-[15px] font-semibold tracking-tight text-ink">{APP_NAME}</span>
      </Link>

      <SidebarNav />

      <div className="mt-auto flex items-center gap-2.5 border-t border-border-soft px-3 pt-4">
        <UserButton />
        <span className="text-body-sm text-ink-muted">Account</span>
      </div>
    </aside>
  )
}
