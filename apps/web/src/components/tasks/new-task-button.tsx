import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

/**
 * The page's primary action, disabled until task creation ships.
 * `focusableWhenDisabled` keeps it reachable by keyboard and hover so the
 * tooltip can say why. The disabled styling is design-system.md §4's.
 */
export function NewTaskButton() {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            disabled
            focusableWhenDisabled
            className="h-auto rounded-md px-5 py-2.75 aria-disabled:cursor-not-allowed aria-disabled:bg-border-soft aria-disabled:text-[#98a5b7] aria-disabled:opacity-100"
          />
        }
      >
        <Plus aria-hidden />
        New Purchase Task
      </TooltipTrigger>
      <TooltipContent side="bottom">Task creation arrives in P1-3.</TooltipContent>
    </Tooltip>
  )
}
