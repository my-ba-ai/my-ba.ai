/** Human-facing product name. */
export const APP_NAME = "my-ba.ai"

/**
 * BullMQ queue names. Declared here so the API (producer) and the worker
 * (consumer) can never drift. Wired up in P0-4.
 */
export const QUEUE_NAMES = {
  SUBURB_REFRESH: "suburb-refresh",
  SCREENING: "screening",
  EMAIL_DISPATCH: "email-dispatch",
  CENSUS_INGEST: "census-ingest",
  AGENT_SCRAPE: "agent-scrape",
} as const

export type QueueName = typeof QUEUE_NAMES[keyof typeof QUEUE_NAMES]

/** Prefix for every REST route exposed by apps/api. */
export const API_PREFIX = "api"
