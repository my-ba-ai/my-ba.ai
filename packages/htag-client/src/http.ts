import type { HtagCallRecord, HtagCallRecorder, HtagTier } from "@my-ba/shared"
import { costOfRecord, parseBillingHeaders, type HtagBillingHeaders } from "./billing"
import type { ResolvedHtagClientConfig } from "./config"
import {
  HtagAuthError,
  HtagBadRequestError,
  HtagBalanceExhaustedError,
  HtagError,
  HtagNetworkError,
  HtagQuotaExceededError,
  HtagResponseError,
  HtagServerError,
  HtagUnexpectedStatusError,
} from "./errors"
import type { HtagLogger } from "./logger"
import { htagEnvelopeSchema } from "./schemas"

export interface HttpContext {
  config: ResolvedHtagClientConfig
  recorder: HtagCallRecorder
  logger: HtagLogger
  fetch: typeof fetch
  sleep: (ms: number) => Promise<void>
  random: () => number
}

export interface HtagRequest {
  method: "GET" | "POST"
  path: string
  tier: HtagTier
  /** GET: query params, already serialised. */
  query?: URLSearchParams
  /** POST: JSON body. */
  body?: Record<string, unknown>
  /**
   * `results` (default): list endpoints, `{ results: [...] }`. `object`: the
   * concordance endpoints answer with one bare object, counted as one row.
   */
  envelope?: "results" | "object"
}

export interface HtagPage {
  /** Raw rows, not yet validated. */
  results: unknown[]
  billing: HtagBillingHeaders
}

/** What the ledger stores as `request_json`: params or body as sent, never the key. */
function requestForLedger(request: HtagRequest): Record<string, unknown> {
  if (request.body) return request.body
  return Object.fromEntries(request.query ?? new URLSearchParams())
}

/** The rows a 2xx body carries, or null if it is not the shape the endpoint promises. */
function extractResults(envelope: HtagRequest["envelope"], body: unknown): unknown[] | null {
  if (envelope === "object") {
    return body !== null && typeof body === "object" && !Array.isArray(body) ? [body] : null
  }
  const parsed = htagEnvelopeSchema.safeParse(body)
  return parsed.success ? parsed.data.results : null
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text()
  try {
    return JSON.parse(text) as unknown
  } catch {
    return text
  }
}

const headerInt = (headers: Headers, name: string) => {
  const value = headers.get(name)
  return value !== null && /^\d+$/.test(value) ? Number(value) : null
}

function errorFor(path: string, status: number, body: unknown, headers: Headers): HtagError {
  switch (status) {
    case 400:
      return new HtagBadRequestError(path, body)
    case 401:
      return new HtagAuthError(path, body)
    case 402:
      return new HtagBalanceExhaustedError(path, body)
    case 429:
      return new HtagQuotaExceededError(
        path,
        body,
        headerInt(headers, "retry-after"),
        headerInt(headers, "x-ratelimit-limit"),
        headerInt(headers, "x-ratelimit-remaining"),
        headerInt(headers, "x-ratelimit-reset"),
      )
    default:
      return status >= 500
        ? new HtagServerError(path, status, body)
        : new HtagUnexpectedStatusError(path, status, body)
  }
}

/**
 * D63: every attempt is recorded, and a ledger failure never costs the caller
 * the data it paid for. Logged loudly instead.
 */
async function record(ctx: HttpContext, call: HtagCallRecord): Promise<void> {
  try {
    await ctx.recorder.record(call)
  } catch (error) {
    ctx.logger.error("Failed to record HtAG call in the spend ledger; continuing", {
      endpoint: call.endpoint,
      statusCode: call.statusCode,
      costAud: call.costAud,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

/**
 * One logical request: up to `maxAttempts` HTTP attempts. Retries 5xx and
 * network errors with exponential backoff and jitter; never retries a 4xx.
 */
export async function send(ctx: HttpContext, request: HtagRequest): Promise<HtagPage> {
  const { config } = ctx
  const url = `${config.baseUrl}${request.path}${request.query?.size ? `?${request.query}` : ""}`
  const ledgerRequest = requestForLedger(request)

  const base = {
    endpoint: request.path,
    request: ledgerRequest,
    tier: request.tier,
  }
  const unbilled = {
    rowsReturned: 0,
    costAud: "0",
    costSource: "none" as const,
    billedUnits: null,
    billingBalanceAud: null,
    billingTier: null,
  }

  const sendAttempt = async (attempt: number): Promise<HtagPage> => {
    const retryable = attempt < config.maxAttempts
    let response: Response
    try {
      response = await ctx.fetch(url, {
        method: request.method,
        headers: {
          accept: "application/json",
          "x-api-key": config.apiKey,
          ...(request.body ? { "content-type": "application/json" } : {}),
        },
        ...(request.body ? { body: JSON.stringify(request.body) } : {}),
        signal: AbortSignal.timeout(config.timeoutMs),
      })
    } catch (error) {
      await record(ctx, { ...base, ...unbilled, statusCode: null })
      if (retryable) {
        await backoff(ctx, attempt)
        return sendAttempt(attempt + 1)
      }
      throw new HtagNetworkError(request.path, error)
    }

    let body: unknown
    try {
      body = await readBody(response)
    } catch (error) {
      await record(ctx, { ...base, ...unbilled, statusCode: null })
      if (retryable) {
        await backoff(ctx, attempt)
        return sendAttempt(attempt + 1)
      }
      throw new HtagNetworkError(request.path, error)
    }

    const { status } = response

    if (status >= 200 && status < 300) {
      const billing = parseBillingHeaders(response.headers, ctx.logger)
      const results = extractResults(request.envelope, body)
      const rowsReturned = results?.length ?? 0
      const cost = costOfRecord({
        status,
        billing,
        rowsReturned,
        tier: request.tier,
        rates: config.tierRatesAud,
        endpoint: request.path,
        logger: ctx.logger,
      })
      await record(ctx, {
        ...base,
        statusCode: status,
        rowsReturned,
        ...cost,
        billedUnits: billing.units,
        billingBalanceAud: billing.balance,
        billingTier: billing.tier,
      })
      if (!results) throw new HtagResponseError(request.path, status, body)
      return { results, billing }
    }

    await record(ctx, { ...base, ...unbilled, statusCode: status })
    if (status >= 500 && retryable) {
      await backoff(ctx, attempt)
      return sendAttempt(attempt + 1)
    }
    throw errorFor(request.path, status, body, response.headers)
  }

  return sendAttempt(1)
}

function backoff(ctx: HttpContext, attempt: number): Promise<void> {
  const { baseDelayMs } = ctx.config
  return ctx.sleep(baseDelayMs * 2 ** (attempt - 1) + ctx.random() * baseDelayMs)
}
