import { htagTierSchema, type HtagTier } from "@my-ba/shared"
import { z } from "zod"

/**
 * Per-row AUD rates inc GST by value tier (Q13d). Used only for pre-call
 * budget estimates (D16) and as the fallback when a 2xx arrives without
 * `X-Billing-Cost` (D62). Prices change; override from config, never inline.
 */
export const DEFAULT_HTAG_TIER_RATES_AUD: Readonly<Partial<Record<HtagTier, number>>> = {
  reference: 0.002,
  standard: 0.031,
  enhanced: 0.075,
  premium: 0.121,
  restricted: 0.222,
}

export const HTAG_PRODUCTION_BASE_URL = "https://api.htagai.com/v1"

export const htagClientConfigSchema = z.object({
  baseUrl: z
    .url()
    .default(HTAG_PRODUCTION_BASE_URL)
    .transform((url) => url.replace(/\/+$/, "")),
  /** Server-side only (cl. 36). Never logged, never recorded. */
  apiKey: z.string().min(1),
  /** Rows per page for paginated GETs and the default query `limit`. Spec max 1000 for GETs. */
  pageSize: z.int().min(1).max(1000).default(100),
  /** Attempts per request, including the first. Only 5xx and network errors are retried. */
  maxAttempts: z.int().min(1).max(10).default(3),
  /** Backoff base: attempt n waits `baseDelayMs × 2^(n-1)` plus up to `baseDelayMs` jitter. */
  baseDelayMs: z.int().nonnegative().default(250),
  timeoutMs: z.int().positive().default(30_000),
  /** Safety stop for auto-pagination. */
  maxPages: z.int().positive().default(1000),
  tierRatesAud: z
    .partialRecord(htagTierSchema, z.number().nonnegative())
    .default({ ...DEFAULT_HTAG_TIER_RATES_AUD }),
})

export type HtagClientConfig = z.input<typeof htagClientConfigSchema>
export type ResolvedHtagClientConfig = z.output<typeof htagClientConfigSchema>

const htagEnvSchema = z.object({
  HTAG_API_KEY: z.string().min(1, "HTAG_API_KEY is required"),
  HTAG_BASE_URL: z.url().optional(),
})

/** Reads `HTAG_API_KEY` (required) and `HTAG_BASE_URL` (optional). */
export function htagClientConfigFromEnv(env: NodeJS.ProcessEnv = process.env): HtagClientConfig {
  const parsed = htagEnvSchema.parse(env)
  return {
    apiKey: parsed.HTAG_API_KEY,
    ...(parsed.HTAG_BASE_URL ? { baseUrl: parsed.HTAG_BASE_URL } : {}),
  }
}
