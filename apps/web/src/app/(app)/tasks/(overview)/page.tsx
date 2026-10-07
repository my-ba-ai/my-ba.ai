import { listPurchaseTasksResponseSchema } from "@my-ba/shared"
import type { Metadata } from "next"
import { ApiFailurePanel } from "@/components/api-failure-panel"
import { PageHeader } from "@/components/shell/page-header"
import { PageTransition } from "@/components/shell/page-transition"
import { NewTaskButton } from "@/components/tasks/new-task-button"
import { TaskCard } from "@/components/tasks/task-card"
import { TaskListEmpty } from "@/components/tasks/task-list-empty"
import { apiFetch } from "@/lib/api-client"
import { classifyApiError } from "@/lib/api-failure"
import { unstable_rethrow } from "next/navigation"

export const metadata: Metadata = { title: "Purchase tasks" }

async function loadTasks() {
  try {
    const { items } = await apiFetch("/purchase-tasks", listPurchaseTasksResponseSchema)
    return { ok: true as const, items }
  } catch (error: unknown) {
    // Next's own control-flow errors (dynamic-usage bailout during prerender,
    // notFound, redirect) must reach Next, not be logged as API failures.
    unstable_rethrow(error)
    const failure = classifyApiError(error)
    // Full detail server-side; the panel shows the one-line version.
    console.error(`[tasks] list failed at stage "${failure.stage}":`, error)
    return { ok: false as const, failure }
  }
}

/**
 * Failures are caught and rendered here rather than thrown to `error.tsx`: in a
 * production build Next strips the message from errors crossing to the client
 * boundary, and the design system's error state needs the stage and raw line.
 */
export default async function TasksPage() {
  const result = await loadTasks()

  return (
    <PageTransition>
      <PageHeader title="Purchase tasks" actions={<NewTaskButton />} />
      {!result.ok ? (
        <ApiFailurePanel failure={result.failure} what="purchase tasks" />
      ) : result.items.length === 0 ? (
        <TaskListEmpty />
      ) : (
        <ul className="space-y-1.75">
          {result.items.map((task) => (
            <li key={task.id}>
              <TaskCard task={task} />
            </li>
          ))}
        </ul>
      )}
    </PageTransition>
  )
}
