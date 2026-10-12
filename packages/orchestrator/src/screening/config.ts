import { AU_STATES, auStateSchema, type AuState } from "@my-ba/shared"
import { z } from "zod"

/**
 * Screener knobs (P1-4). Read from env in the worker; defaults mirror
 * `DEFAULT_SCREENING_SHAPE` in `@my-ba/htag-client`, which prices them.
 */
export interface ScreeningConfig {
  /** `SCREEN_QUERY_LIMIT`: `/markets/query` limit. Returned == limit ⇒ too broad (D42). */
  queryLimit: number
  /** `SCREEN_RESTRICTED_TOP_N`: ranked suburbs that get Restricted-tier supply detail. */
  restrictedTopN: number
  /** `SCREEN_TREND_BATCH_SIZE`: `area_id`s per comma-list trend request (Q13e). */
  trendBatchSize: number
  /**
   * `SCREEN_STATES_OVERRIDE` (Q04, AC 8): dev-only. Replaces the task's
   * `states` for the run, e.g. `NSW` to validate on one state cheaply.
   * Refused when `NODE_ENV=production`.
   */
  statesOverride: AuState[] | null
}

export const DEFAULT_SCREENING_CONFIG: Readonly<ScreeningConfig> = {
  queryLimit: 100,
  restrictedTopN: 6,
  trendBatchSize: 50,
  statesOverride: null,
}

const statesList = z
  .string()
  .transform((value) =>
    value
      .split(",")
      .map((state) => state.trim().toUpperCase())
      .filter((state) => state.length > 0),
  )
  .pipe(z.array(auStateSchema).min(1, `Use states from ${AU_STATES.join(", ")}`))

const envSchema = z.object({
  NODE_ENV: z.string().optional(),
  SCREEN_QUERY_LIMIT: z.coerce.number().int().min(1).max(1000).optional(),
  SCREEN_RESTRICTED_TOP_N: z.coerce.number().int().min(0).max(100).optional(),
  SCREEN_TREND_BATCH_SIZE: z.coerce.number().int().min(1).max(200).optional(),
  SCREEN_STATES_OVERRIDE: z
    .string()
    .optional()
    .transform((value) => (value?.trim() ? value : undefined))
    .pipe(statesList.optional()),
})

export function screeningConfigFromEnv(env: NodeJS.ProcessEnv = process.env): ScreeningConfig {
  const parsed = envSchema.parse(env)
  if (parsed.SCREEN_STATES_OVERRIDE && parsed.NODE_ENV === "production") {
    throw new Error("SCREEN_STATES_OVERRIDE is a dev-only setting; unset it in production.")
  }
  return {
    queryLimit: parsed.SCREEN_QUERY_LIMIT ?? DEFAULT_SCREENING_CONFIG.queryLimit,
    restrictedTopN: parsed.SCREEN_RESTRICTED_TOP_N ?? DEFAULT_SCREENING_CONFIG.restrictedTopN,
    trendBatchSize: parsed.SCREEN_TREND_BATCH_SIZE ?? DEFAULT_SCREENING_CONFIG.trendBatchSize,
    statesOverride: parsed.SCREEN_STATES_OVERRIDE
      ? [...new Set(parsed.SCREEN_STATES_OVERRIDE)]
      : null,
  }
}
