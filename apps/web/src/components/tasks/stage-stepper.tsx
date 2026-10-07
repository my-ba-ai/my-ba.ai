import { TASK_STATUS_LABEL, stageIndex } from "@/lib/task-status"
import { TASK_STATUS_ORDER, type TaskStatus } from "@my-ba/shared"
import { cn } from "cn"

interface Props extends React.HTMLAttributes<HTMLElement> {
  status: TaskStatus
  variant?: "compact" | "full"
}
/**
 * Pipeline position. `compact` is the card-row variant: one segment per stage,
 * filled up to and including the current one. `full` labels every stage and is
 * used on the task detail page.
 *
 * Both expose the position as text for assistive tech ("Stage 2 of 9:
 * Screening") rather than relying on how many segments are filled.
 */
export function StageStepper({ status, variant = "compact", className, ...rest }: Readonly<Props>) {
  const current = stageIndex(status)
  const total = TASK_STATUS_ORDER.length
  const summary = `Stage ${current + 1} of ${total}: ${TASK_STATUS_LABEL[status]}`

  if (variant === "compact") {
    return (
      <div className={cn("flex items-center gap-0.75", className)} {...rest}>
        <img
          alt={summary}
          src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1 1'/%3E"
          className="sr-only"
        />
        {TASK_STATUS_ORDER.map((stage, index) => (
          <span
            key={stage}
            data-state={index < current ? "done" : index === current ? "current" : "todo"}
            className={cn(
              "h-1.5 w-4 rounded-full",
              index < current && "bg-accent-teal",
              index === current && "bg-accent-alt",
              index > current && "bg-border-card",
            )}
          />
        ))}
      </div>
    )
  }

  return (
    <ol aria-label="Pipeline" className={cn("flex gap-2", className)} {...rest}>
      {TASK_STATUS_ORDER.map((stage, index) => {
        const state = index < current ? "done" : index === current ? "current" : "todo"
        return (
          <li
            key={stage}
            data-state={state}
            aria-current={state === "current" ? "step" : undefined}
            className={cn("space-y-1.5 flex-1", state === "current" && "max-lg:flex-3")}
          >
            <span
              aria-hidden
              className={cn(
                "block h-1.5 rounded-full",
                state === "done" && "bg-accent-teal",
                state === "current" && "bg-accent-alt",
                state === "todo" && "bg-border-card",
              )}
            />
            <span
              className={cn(
                "block font-data text-micro uppercase",
                state === "todo" ? "text-ink-dim max-lg:sr-only" : "text-ink-3",
              )}
            >
              <span className="text-ink-dim">{String(index + 1).padStart(2, "0")} </span>
              <span className="block">{TASK_STATUS_LABEL[stage]}</span>
            </span>
          </li>
        )
      })}
    </ol>
  )
}
