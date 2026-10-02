import type { Metadata } from "next"
import { PageHeader } from "@/components/shell/page-header"
import { PageTransition } from "@/components/shell/page-transition"
import { TaskCriteriaForm } from "@/components/tasks/criteria-form/task-criteria-form"
import { breadcrumbs } from "@/lib/breadcrumbs"
import { emptyFormValues } from "@/lib/criteria-form"
import { loadScreeningEstimate } from "@/lib/screening-estimate"

export const metadata: Metadata = { title: "New purchase task" }

/** Create a purchase task (P1-3). Saves as a draft; running arrives with P1-6. */
export default async function NewTaskPage() {
  const estimate = await loadScreeningEstimate()
  return (
    <PageTransition>
      <PageHeader title="New purchase task" breadcrumbs={breadcrumbs.newTask()} />
      <TaskCriteriaForm taskId={null} initialValues={emptyFormValues()} estimate={estimate} />
    </PageTransition>
  )
}
