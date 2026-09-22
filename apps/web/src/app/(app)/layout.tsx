import { UserButton } from "@clerk/nextjs"
import { APP_NAME } from "@my-ba/shared"
import { AppSidebar } from "@/components/shell/app-sidebar"

/**
 * The authenticated shell. Protection itself is in `proxy.ts`, not here: a
 * layout check runs after the route has started rendering, and layouts do not
 * re-run on client navigation, so it is the wrong place to enforce anything.
 */
export default function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-dvh">
      <AppSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Below md the sidebar is hidden. Only Tasks is live, so a bar with the
            wordmark and account menu is enough until there is more to navigate. */}
        <div className="flex items-center justify-between border-b border-border-panel bg-surface px-4 py-3 md:hidden">
          <span className="text-[15px] font-semibold tracking-tight">{APP_NAME}</span>
          <UserButton />
        </div>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 md:px-10 md:py-10">
          {children}
        </main>
      </div>
    </div>
  )
}
