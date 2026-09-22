"use client"

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "cn"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { NavIcon } from "./nav-icon"
import { NAV_ITEMS, type NavItem } from "./nav-items"

const itemClass =
  "flex items-center gap-2.5 rounded-md px-3 py-2 text-value-lg font-medium transition-colors duration-150"

/**
 * Client only for `usePathname`. Disabled items are buttons with
 * `aria-disabled`, not the `disabled` attribute, because a natively disabled
 * element never receives the hover or focus that opens the tooltip explaining
 * why it is disabled. The accessible name carries the phase, since an
 * `aria-label` replaces the visible text (including the phase badge).
 */
export function SidebarNav({ items = NAV_ITEMS }: Readonly<{ items?: readonly NavItem[] }>) {
  const pathname = usePathname()

  return (
    <nav aria-label="Main">
      <ul className="space-y-0.5">
        {items.map((item) => (
          <li key={item.label}>
            {"href" in item ? (
              <Link
                href={item.href}
                aria-current={pathname.startsWith(item.href) ? "page" : undefined}
                className={cn(
                  itemClass,
                  "text-ink-3 hover:bg-surface-inset hover:text-ink",
                  "aria-[current=page]:bg-surface aria-[current=page]:text-accent-deep aria-[current=page]:shadow-[0_0_0_1px_var(--border-card)]",
                )}
              >
                <NavIcon name={item.icon} />
                {item.label}
              </Link>
            ) : (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <button
                      type="button"
                      aria-label={`${item.label}, arrives in ${item.availableIn}`}
                      aria-disabled="true"
                      tabIndex={0}
                      className={cn(itemClass, "cursor-not-allowed text-ink-dim")}
                    />
                  }
                >
                  <NavIcon name={item.icon} />
                  {item.label}
                  <span className="ml-auto font-data text-micro uppercase">{item.availableIn}</span>
                </TooltipTrigger>
                <TooltipContent side="right">
                  {item.label} arrives in {item.availableIn}.
                </TooltipContent>
              </Tooltip>
            )}
          </li>
        ))}
      </ul>
    </nav>
  )
}
