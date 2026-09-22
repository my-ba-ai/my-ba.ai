import type { TaskStatus } from "@my-ba/shared"
import { cn } from "cn"
import { TASK_STATUS_LABEL, TASK_STATUS_TONE, type StatusTone } from "@/lib/task-status"

const TONE_CLASS: Record<StatusTone, { pill: string; dot: string }> = {
  neutral: { pill: "border-border-strong bg-surface-sunk text-ink-muted", dot: "bg-ink-dim" },
  active: {
    pill: "border-accent-teal/35 bg-accent-teal/8 text-accent-deep",
    dot: "bg-accent-teal animate-pulse-live",
  },
  agent: {
    pill: "border-accent-alt/35 bg-accent-alt/8 text-accent-alt-deep",
    dot: "bg-accent-alt",
  },
}

/**
 * design-system.md §4 status pill: 999px radius, tinted border, 6px dot,
 * uppercase 10.5px data label. The label always carries the meaning; colour
 * only reinforces it.
 */
export function StatusPill({ status }: Readonly<{ status: TaskStatus }>) {
  const tone = TONE_CLASS[TASK_STATUS_TONE[status]]
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-4xl border px-2.5 font-data text-micro-lg whitespace-nowrap uppercase",
        tone.pill,
      )}
    >
      <span aria-hidden className={cn("size-1.5 rounded-full", tone.dot)} />
      {TASK_STATUS_LABEL[status]}
    </span>
  )
}
