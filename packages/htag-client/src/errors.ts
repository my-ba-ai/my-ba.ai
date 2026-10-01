import { badRequestBodySchema, paymentRequiredBodySchema, unauthorizedBodySchema } from "./schemas"

/**
 * Base class. `body` keeps whatever HtAG sent, parsed as JSON when possible,
 * so an unfamiliar error shape is never thrown away.
 */
export class HtagError extends Error {
  override readonly name: string = "HtagError"

  constructor(
    message: string,
    readonly endpoint: string,
    readonly status: number | null,
    readonly body: unknown,
    options?: { cause?: unknown },
  ) {
    super(message, options)
  }
}

/** 400: invalid parameters, unknown `logic` field, malformed body. Never retried. */
export class HtagBadRequestError extends HtagError {
  override readonly name = "HtagBadRequestError"
  readonly detail: string | null
  readonly errors: unknown[] | null

  constructor(endpoint: string, body: unknown) {
    const parsed = badRequestBodySchema.safeParse(body)
    const detail = parsed.success ? (parsed.data.detail ?? null) : null
    super(`HtAG rejected the request: ${detail ?? "bad request"}`, endpoint, 400, body)
    this.detail = detail
    this.errors = parsed.success ? (parsed.data.errors ?? null) : null
  }
}

/** 401: missing or invalid API key. Never retried. */
export class HtagAuthError extends HtagError {
  override readonly name = "HtagAuthError"

  constructor(endpoint: string, body: unknown) {
    const parsed = unauthorizedBodySchema.safeParse(body)
    const message = parsed.success ? parsed.data.message : undefined
    super(`HtAG authentication failed: ${message ?? "unauthorized"}`, endpoint, 401, body)
  }
}

/** 402: free allowance used up and the account balance is empty. Never retried. */
export class HtagBalanceExhaustedError extends HtagError {
  override readonly name = "HtagBalanceExhaustedError"
  /** Account balance HtAG reported, AUD decimal string. */
  readonly balance: string | null

  constructor(endpoint: string, body: unknown) {
    const parsed = paymentRequiredBodySchema.safeParse(body)
    const data = parsed.success ? parsed.data : {}
    super(`HtAG balance exhausted: ${data.message ?? "payment required"}`, endpoint, 402, body)
    this.balance = data.balance ?? null
  }
}

/** 429: this endpoint's monthly billable-unit cap is spent. Resets on the 1st (UTC). Never retried. */
export class HtagQuotaExceededError extends HtagError {
  override readonly name = "HtagQuotaExceededError"

  constructor(
    endpoint: string,
    body: unknown,
    readonly retryAfterSeconds: number | null,
    readonly rateLimitLimit: number | null,
    readonly rateLimitRemaining: number | null,
    /** Unix epoch seconds (UTC) when the quota window resets. */
    readonly rateLimitReset: number | null,
  ) {
    super("HtAG monthly quota exceeded for this endpoint", endpoint, 429, body)
  }
}

/** 5xx, after every retry was used. */
export class HtagServerError extends HtagError {
  override readonly name = "HtagServerError"

  constructor(endpoint: string, status: number, body: unknown) {
    super(`HtAG server error ${status}`, endpoint, status, body)
  }
}

/** Any other non-2xx (403, 404, 422…). Never retried. */
export class HtagUnexpectedStatusError extends HtagError {
  override readonly name = "HtagUnexpectedStatusError"

  constructor(endpoint: string, status: number, body: unknown) {
    super(`HtAG returned unexpected status ${status}`, endpoint, status, body)
  }
}

/** No HTTP response: DNS, connection reset, timeout. Retried; thrown after the last attempt. */
export class HtagNetworkError extends HtagError {
  override readonly name = "HtagNetworkError"

  constructor(endpoint: string, cause: unknown) {
    super(`HtAG request failed without a response`, endpoint, null, null, { cause })
  }
}

/** A 2xx whose body is not the `{ results: [...] }` envelope. The call was still billed and recorded. */
export class HtagResponseError extends HtagError {
  override readonly name = "HtagResponseError"

  constructor(endpoint: string, status: number, body: unknown) {
    super(`HtAG returned ${status} with an unrecognised body`, endpoint, status, body)
  }
}
