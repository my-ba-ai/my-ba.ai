import { PageHeader } from "@/components/shell/page-header"
import { NewTaskButton } from "@/components/tasks/new-task-button"
import { TaskListSkeleton } from "@/components/tasks/task-list-skeleton"

export default function TasksLoading() {
  return (
    <>
      <PageHeader title="Purchase tasks" actions={<NewTaskButton />} />
      <TaskListSkeleton />
    </>
  )
}
