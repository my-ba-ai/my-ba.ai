"use client"

import { runScreening } from "@/app/(app)/tasks/[taskId]/actions"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Play, RotateCcw } from "lucide-react"
import { useState, useTransition } from "react"

interface Props {
  taskId: string
  /** Why the criteria can't run yet. Non-empty disables the button and lists them. */
  blockers?: readonly string[]
  variant?: "run" | "rerun" | "retry"
}

const LABEL = {
  run: "Run screening",
  rerun: "Re-run screening",
  retry: "Retry",
} as const

const NO_BLOCKERS: readonly string[] = []

/**
 * Starts (or retries) the screening stage (P1-6). Every run spends HtAG
 * money, so the button stays disabled while the request is in flight; the
 * API refuses a second run while one is queued or running anyway (409).
 */
export function RunScreeningButton({
  taskId,
  blockers = NO_BLOCKERS,
  variant = "run",
}: Readonly<Props>) {
  const [message, setMessage] = useState<string | null>(null)
  const [isPending, startRun] = useTransition()
  const blocked = blockers.length > 0
  const Icon = variant === "retry" ? RotateCcw : Play

  const onRun = () => {
    setMessage(null)
    startRun(async () => {
      const failure = await runScreening(taskId)
      if (failure) setMessage(failure.message)
    })
  }

  const button = blocked ? (
    <Tooltip>
      <TooltipTrigger render={<Button type="button" disabled focusableWhenDisabled />}>
        <Icon aria-hidden />
        {LABEL[variant]}
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-xs">
        <p>Not runnable yet:</p>
        <ul className="list-disc pl-4">
          {blockers.map((blocker) => (
            <li key={blocker}>{blocker}</li>
          ))}
        </ul>
      </TooltipContent>
    </Tooltip>
  ) : (
    <Button type="button" onClick={onRun} disabled={isPending}>
      <Icon aria-hidden />
      {isPending ? "Starting…" : LABEL[variant]}
    </Button>
  )

  return (
    <span className="inline-flex flex-col items-end gap-1">
      {button}
      {message ? (
        <span role="alert" className="max-w-xs text-right text-body-sm text-neg">
          {message}
        </span>
      ) : null}
    </span>
  )
}
