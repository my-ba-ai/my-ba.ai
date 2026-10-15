import type { ScreeningStage, StageFailureReason } from "@my-ba/shared"
import { cn } from "cn"
import { RunScreeningButton } from "./run-screening-button"
import { StagePoller } from "./stage-poller"

interface Props {
  taskId: string
  stage: ScreeningStage
}

/** What each typed failure means for the investor, and what fixes it (P1-4 AC 5). */
export const FAILURE_MESSAGE: Record<StageFailureReason, string> = {
  HTAG_QUOTA_EXCEEDED: "HtAG's request quota is used up. Retry once it resets.",
  HTAG_BALANCE_EXHAUSTED: "The HtAG account balance has run out. Top it up, then retry.",
  INVALID_CRITERIA: "The saved criteria couldn't be screened.",
  UNEXPECTED:
    "Something went wrong while screening. Retry; if it keeps failing, check the worker logs.",
}

const aud = (amount: string) => `A$${Number(amount).toFixed(2)}`

function headline(stage: ScreeningStage): {
  title: string
  body: string
  tone: "live" | "neg" | "quiet"
} {
  if (stage.stalled) {
    return {
      title: "Not responding",
      body: "The screening worker hasn't reported progress for several minutes, so the job was likely lost. Retry picks up from where it stopped; if the last attempt never finished, it screens again, which costs HtAG credit.",
      tone: "neg",
    }
  }
  switch (stage.state) {
    case "queued":
      return {
        title: "Queued",
        body: "Waiting for the screening worker to pick this up.",
        tone: "live",
      }
    case "running":
      return {
        title: `Screening${stage.attempt && stage.attempt > 1 ? ` (attempt ${stage.attempt})` : ""}`,
        body: "Querying HtAG and ranking the suburbs that pass your filters.",
        tone: "live",
      }
    case "awaiting_approval":
      if (stage.gate?.kind === "SCREENING_TOO_BROAD") {
        return {
          title: "Too broad",
          body: `The screen hit HtAG's ${stage.gate.limit}-row cap, so the result is truncated and unordered. Tighten the criteria and run again.`,
          tone: "quiet",
        }
      }
      return {
        title: "Ready for review",
        body: `${stage.gate?.kind === "SCREENING_APPROVAL" ? stage.gate.rankedSuburbs.length : 0} suburbs ranked and waiting for your approval. The review screen arrives with P1-5.`,
        tone: "quiet",
      }
    case "failed":
      return {
        title: "Screening failed",
        body: stage.failureReason
          ? FAILURE_MESSAGE[stage.failureReason]
          : FAILURE_MESSAGE.UNEXPECTED,
        tone: "neg",
      }
    case "rejected":
      return {
        title: "Sent back for changes",
        body: "You rejected the last screen. Edit the criteria, then re-run screening.",
        tone: "quiet",
      }
    case "approved":
      return {
        title: "Screening approved",
        body: "The shortlist moves on to trend analysis, which arrives in Phase 2.",
        tone: "quiet",
      }
  }
}

/**
 * The screening stage on the task detail page (P1-6): where it is, what it
 * cost, and the one action that applies (Retry after a failure, or when the
 * stage has stalled). Polls while the worker has it. Approve / Reject & Adjust are P1-5's.
 */
export function ScreeningStagePanel({ taskId, stage }: Readonly<Props>) {
  const { title, body, tone } = headline(stage)
  // A stalled stage stops polling: it waits for the user's Retry.
  const active = (stage.state === "queued" || stage.state === "running") && !stage.stalled
  const retry = stage.state === "failed" || stage.stalled

  return (
    <section
      aria-labelledby="screening-stage-title"
      aria-live="polite"
      className={cn(
        "flex flex-wrap items-start justify-between gap-4 rounded-xl border px-4 py-3",
        tone === "neg" ? "border-neg-border bg-neg-bg" : "border-border-card bg-surface-sunk",
      )}
    >
      <div className="min-w-0 space-y-1">
        <p className="font-data text-micro-lg text-ink-dim uppercase">Screening</p>
        <h2
          id="screening-stage-title"
          className={cn(
            "flex items-center gap-2 text-section",
            tone === "neg" ? "text-neg" : "text-ink",
          )}
        >
          {tone === "live" ? (
            <span aria-hidden className="size-1.5 animate-pulse-live rounded-full bg-accent-teal" />
          ) : null}
          {title}
        </h2>
        <p className="max-w-[64ch] text-body-sm text-ink-muted">{body}</p>
        <p className="font-data text-body-sm text-ink-3">
          {stage.attempt ? `Attempt ${stage.attempt} · ${aud(stage.costAud)}` : "No attempt yet"}
          {stage.totalCostAud !== stage.costAud
            ? ` · ${aud(stage.totalCostAud)} across all attempts`
            : ""}
        </p>
      </div>
      {retry ? <RunScreeningButton taskId={taskId} variant="retry" /> : null}
      {active ? <StagePoller taskId={taskId} version={stage.version} /> : null}
    </section>
  )
}
