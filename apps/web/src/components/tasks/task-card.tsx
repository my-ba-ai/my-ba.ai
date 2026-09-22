import type { PurchaseTaskSummary } from "@my-ba/shared"
import Link from "next/link"
import { formatDateTime } from "@/lib/format"
import { LockedChip } from "./locked-chip"
import { StageStepper } from "./stage-stepper"
import { StatusPill } from "./status-pill"

/**
 * One task in the list (design-system.md §4 data row). The whole row is the
 * link. Shortlist count, criteria summary and the overflow menu from the brief
 * are absent until P1-3/P1-4/Phase 3 give them something to show or do.
 */
export function TaskCard({ task }: Readonly<{ task: PurchaseTaskSummary }>) {
  return (
    <Link
      href={`/tasks/${task.id}`}
      className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 gap-y-2.5 rounded-xl border border-border-card bg-surface px-4.5 py-3.5 transition duration-150 hover:-translate-y-px hover:border-accent-teal hover:bg-[#f8fafd] hover:shadow-[0_12px_26px_-20px_rgba(14,165,160,.6)] md:grid-cols-[minmax(0,1fr)_auto_auto]"
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-ink">{task.name}</p>
        <p className="font-data text-body-sm text-ink-muted">
          Updated <time dateTime={task.updatedAt}>{formatDateTime(task.updatedAt)}</time>
        </p>
      </div>
      <div className="flex items-center gap-2 justify-self-end md:order-3">
        {task.lockedAt ? <LockedChip /> : null}
        <StatusPill status={task.status} />
      </div>
      <div className="col-span-2 md:order-2 md:col-span-1">
        <StageStepper status={task.status} />
      </div>
    </Link>
  )
}
