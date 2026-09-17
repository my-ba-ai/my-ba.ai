/** Human-facing product name. */
export const APP_NAME = "my-ba.ai"

/**
 * BullMQ queue names. Declared here so the API (producer) and the worker
 * (consumer) can never drift.
 *
 * A name existing here does not mean the queue is registered: each ticket
 * registers its own queue in both apps when it lands a processor for it. Only
 * `DIAGNOSTICS` is wired today (P0-4).
 */
export const QUEUE_NAMES = {
  /** P0-4 smoke queue. Proves producer -> Redis -> processor end to end. */
  DIAGNOSTICS: "diagnostics",
  SUBURB_REFRESH: "suburb-refresh",
  SCREENING: "screening",
  EMAIL_DISPATCH: "email-dispatch",
  CENSUS_INGEST: "census-ingest",
  AGENT_SCRAPE: "agent-scrape",
} as const

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES]

/**
 * Prefix for every BullMQ key in Redis (`<prefix>:<queue>:...`). Both apps must
 * agree on it or the worker listens to a queue nobody writes to — silently.
 */
export const QUEUE_PREFIX = "my-ba"

/** Prefix for every REST route exposed by apps/api. */
export const API_PREFIX = "api"
