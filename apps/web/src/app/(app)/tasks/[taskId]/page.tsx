import { purchaseTaskDetailSchema, purchaseTaskIdParamSchema } from "@my-ba/shared"
import { ChevronRight } from "lucide-react"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ApiFailurePanel } from "@/components/api-failure-panel"
import { PageHeader } from "@/components/shell/page-header"
import { LockedChip } from "@/components/tasks/locked-chip"
import { StageStepper } from "@/components/tasks/stage-stepper"
import { StatusPill } from "@/components/tasks/status-pill"
import { ApiError, apiFetch } from "@/lib/api-client"
import { classifyApiError } from "@/lib/api-failure"
import { formatDateTime } from "@/lib/format"

async function loadTask(taskId: string) {
  try {
    const task = await apiFetch(`/purchase-tasks/${taskId}`, purchaseTaskDetailSchema)
    return { ok: true as const, task }
  } catch (error: unknown) {
    // Missing and other-tenant are both 404 from the API, by design.
    if (error instanceof ApiError && error.status === 404) notFound()
    const failure = classifyApiError(error)
    console.error(`[tasks] detail ${taskId} failed at stage "${failure.stage}":`, error)
    return { ok: false as const, failure }
  }
}

const breadcrumb = (current: string) => (
  <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-body-sm text-ink-muted">
    <Link href="/tasks" className="hover:text-accent-deep">
      Tasks
    </Link>
    <ChevronRight aria-hidden className="size-3.5" />
    <span aria-current="page" className="truncate text-ink-3">
      {current}
    </span>
  </nav>
)

/**
 * Placeholder task detail (P0-6). Proves routing, the tenant-scoped read and the
 * 404 path. Stage views replace the body from P1-5/P1-7 onward.
 */
export default async function TaskDetailPage({ params }: PageProps<"/tasks/[taskId]">) {
  const { taskId } = await params

  // A malformed id cannot name a task. Answer locally rather than spending a
  // round trip on a 400.
  if (!purchaseTaskIdParamSchema.safeParse(taskId).success) notFound()

  const result = await loadTask(taskId)

  if (!result.ok) {
    return (
      <>
        <PageHeader title="Purchase task" eyebrow={breadcrumb("Task")} />
        <ApiFailurePanel failure={result.failure} what="this task" />
      </>
    )
  }

  const { task } = result
  return (
    <>
      <PageHeader
        title={task.name}
        eyebrow={breadcrumb(task.name)}
        actions={
          <>
            {task.lockedAt ? <LockedChip /> : null}
            <StatusPill status={task.status} />
          </>
        }
      />

      <section className="space-y-6 rounded-2xl border border-border-panel bg-surface p-6 shadow-panel">
        <StageStepper status={task.status} variant="full" />

        <dl className="grid gap-3 sm:grid-cols-3">
          {[
            { label: "Created", value: formatDateTime(task.createdAt), iso: task.createdAt },
            { label: "Last updated", value: formatDateTime(task.updatedAt), iso: task.updatedAt },
            {
              label: "Locked",
              value: task.lockedAt ? formatDateTime(task.lockedAt) : "Not locked",
              iso: task.lockedAt,
            },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-xl border border-border-card bg-surface-sunk px-4 py-3"
            >
              <dt className="font-data text-micro-lg text-ink-dim uppercase">{item.label}</dt>
              <dd className="mt-1 font-data text-value-lg font-semibold text-ink">
                {item.iso ? <time dateTime={item.iso}>{item.value}</time> : item.value}
              </dd>
            </div>
          ))}
        </dl>

        <p className="max-w-[64ch] text-body-sm text-ink-muted">
          Stage views (screening results, approval gates, run log) arrive in Phase 1. This page
          shows only where the task is in the pipeline.
        </p>
      </section>
    </>
  )
}
