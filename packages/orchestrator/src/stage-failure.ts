/**
 * A node failure with a typed reason (P1-4 AC 5). The reason travels in the
 * message as a `[REASON]` prefix because that is what survives the
 * checkpoint: LangGraph serialises a node's error, and a custom class or
 * property does not come back from Postgres, but the message does.
 * `deriveStageResult` reads it back out with `stageFailureReason`.
 */
export class StageFailedError extends Error {
  override readonly name = "StageFailedError"

  constructor(
    readonly reason: string,
    detail: string,
    options?: { cause?: unknown },
  ) {
    super(`[${reason}] ${detail}`, options)
  }
}

const REASON_PREFIX = /\[([A-Z][A-Z0-9_]*)\]/

/** The `[REASON]` a `StageFailedError` put in its message, if any. */
export function stageFailureReason(message: string): string | undefined {
  return REASON_PREFIX.exec(message)?.[1]
}
