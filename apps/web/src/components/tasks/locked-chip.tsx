import { Lock } from "lucide-react"

/** Amber LOCKED chip (design-system.md §4, permission-denied). Shown when `lockedAt` is set (D04). */
export function LockedChip() {
  return (
    <span className="inline-flex h-6 items-center gap-1 rounded-4xl border border-warn-border bg-[#fdf8ef] px-2.5 font-data text-micro-lg text-warn uppercase">
      <Lock aria-hidden className="size-3" />
      Locked
    </span>
  )
}
