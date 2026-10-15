import { ApiFailurePanel } from "@/components/api-failure-panel"
import { PageHeader } from "@/components/shell/page-header"
import { PageTransition } from "@/components/shell/page-transition"
import { LockedChip } from "@/components/tasks/locked-chip"
import { RunScreeningButton } from "@/components/tasks/run-screening-button"
import { ScreeningStagePanel } from "@/components/tasks/screening-stage-panel"
import { StageStepper } from "@/components/tasks/stage-stepper"
import { Button } from "@/components/ui/button"
import { ApiError, apiFetch } from "@/lib/api-client"
import { classifyApiError } from "@/lib/api-failure"
import { breadcrumbs } from "@/lib/breadcrumbs"
import { draftToFormValues, runBlockers } from "@/lib/criteria-form"
import { formatDateTime } from "@/lib/format"
import { NAV_BACK, NAV_FORWARD, taskTitleTransitionName } from "@/lib/view-transitions"
import { purchaseTaskDetailSchema, purchaseTaskIdParamSchema } from "@my-ba/shared"
import { Pencil } from "lucide-react"
import Link from "next/link"
import { notFound, unstable_rethrow } from "next/navigation"

async function loadTask(taskId: string) {
  try {
    const task = await apiFetch(`/purchase-tasks/${taskId}`, purchaseTaskDetailSchema)
    return { ok: true as const, task }
  } catch (error: unknown) {
    // Next's own control-flow errors (dynamic-usage bailout during prerender,
    // notFound, redirect) must reach Next, not be logged as API failures.
    unstable_rethrow(error)
    // Missing and other-tenant are both 404 from the API, by design.
    if (error instanceof ApiError && error.status === 404) notFound()
    const failure = classifyApiError(error)
    console.error(`[tasks] detail ${taskId} failed at stage "${failure.stage}":`, error)
    return { ok: false as const, failure }
  }
}

/**
 * Task detail. P0-6 placeholder plus the screening stage (P1-6): Run from a
 * draft, then where the stage is (queued / running / awaiting approval /
 * failed + Retry), refreshing while the worker has it. Stage views (approval,
 * results) replace more of the body from P1-5/P1-7 onward.
 */
export default async function TaskDetailPage({ params }: PageProps<"/tasks/[taskId]">) {
  const { taskId } = await params

  // A malformed id cannot name a task. Answer locally rather than spending a
  // round trip on a 400.
  if (!purchaseTaskIdParamSchema.safeParse(taskId).success) notFound()

  const result = await loadTask(taskId)

  if (!result.ok) {
    return (
      <PageTransition>
        <PageHeader title="Purchase task" breadcrumbs={breadcrumbs.taskUnavailable()} />
        <ApiFailurePanel failure={result.failure} what="this task" />
      </PageTransition>
    )
  }

  const { task } = result
  const isEditableDraft = task.status === "DRAFT" && !task.lockedAt
  return (
    <PageTransition>
      <PageHeader
        title={task.name}
        titleTransitionName={taskTitleTransitionName(task.id)}
        breadcrumbs={breadcrumbs.task(task)}
        actions={
          <>
            {task.lockedAt ? <LockedChip /> : null}
            <Button
              variant="outline"
              render={<Link href={`/tasks`} transitionTypes={NAV_BACK} />}
              nativeButton={false}
            >
              Back to Tasks
            </Button>
            {isEditableDraft ? (
              <Button
                variant="outline"
                render={<Link href={`/tasks/${task.id}/edit`} transitionTypes={NAV_FORWARD} />}
                nativeButton={false}
              >
                <Pencil aria-hidden />
                Edit criteria
              </Button>
            ) : null}
            {isEditableDraft ? (
              <RunScreeningButton
                taskId={task.id}
                blockers={runBlockers(draftToFormValues(task.name, task.criteria))}
                variant={task.screening?.state === "rejected" ? "rerun" : "run"}
              />
            ) : null}
          </>
        }
      />
      <section className="space-y-10 rounded-2xl border border-border-panel bg-surface p-6 shadow-panel">
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

        {task.screening ? (
          <ScreeningStagePanel taskId={task.id} stage={task.screening} />
        ) : (
          <p className="max-w-[64ch] text-body-sm text-ink-muted">
            Not screened yet. Run screening when the criteria are ready; each run spends HtAG data
            budget.
          </p>
        )}
      </section>
    </PageTransition>
  )
}
