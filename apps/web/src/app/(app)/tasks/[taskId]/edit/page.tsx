import { ApiFailurePanel } from "@/components/api-failure-panel"
import { PageHeader } from "@/components/shell/page-header"
import { PageTransition } from "@/components/shell/page-transition"
import { TaskCriteriaForm } from "@/components/tasks/criteria-form/task-criteria-form"
import { ApiError, apiFetch } from "@/lib/api-client"
import { classifyApiError } from "@/lib/api-failure"
import { breadcrumbs } from "@/lib/breadcrumbs"
import { draftToFormValues } from "@/lib/criteria-form"
import { loadScreeningEstimate } from "@/lib/screening-estimate"
import { purchaseTaskDetailSchema, purchaseTaskIdParamSchema } from "@my-ba/shared"
import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"

export const metadata: Metadata = { title: "Edit purchase task" }

/**
 * Edit a draft's criteria (P1-3). Only `DRAFT` tasks are editable (the API
 * answers 409 otherwise); anything further along goes back to its detail page,
 * where cloning will be the way to change criteria (D05).
 */
export default async function EditTaskPage({ params }: PageProps<"/tasks/[taskId]/edit">) {
  const { taskId } = await params
  if (!purchaseTaskIdParamSchema.safeParse(taskId).success) notFound()

  let task
  try {
    task = await apiFetch(`/purchase-tasks/${taskId}`, purchaseTaskDetailSchema)
  } catch (error: unknown) {
    if (error instanceof ApiError && error.status === 404) notFound()
    const failure = classifyApiError(error)
    console.error(`[tasks] edit ${taskId} failed at stage "${failure.stage}":`, error)
    return (
      <PageTransition>
        <PageHeader title="Edit purchase task" breadcrumbs={breadcrumbs.taskUnavailable()} />
        <ApiFailurePanel failure={failure} what="this task" />
      </PageTransition>
    )
  }

  if (task.status !== "DRAFT" || task.lockedAt) redirect(`/tasks/${task.id}`)

  const estimate = await loadScreeningEstimate()

  return (
    <PageTransition>
      <PageHeader title={`Edit ${task.name}`} breadcrumbs={breadcrumbs.taskEdit(task)} />
      <TaskCriteriaForm
        taskId={task.id}
        initialValues={draftToFormValues(task.name, task.criteria)}
        estimate={estimate}
      />
    </PageTransition>
  )
}
