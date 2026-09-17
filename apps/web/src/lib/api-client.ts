import { auth } from "@clerk/nextjs/server"
import type { ZodType } from "zod"

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api"

/** The API answered, and said no. `body` is Nest's reason. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
    message: string,
  ) {
    super(message)
    this.name = "ApiError"
  }
}

/** Nothing answered. Wrong port, process down, or the URL is not what you think. */
export class ApiUnreachableError extends Error {
  constructor(
    readonly url: string,
    override readonly cause: unknown,
  ) {
    super(`No response from ${url} — ${cause instanceof Error ? cause.message : String(cause)}`)
    this.name = "ApiUnreachableError"
  }
}

/** The API answered 2xx with something this client could not accept. */
export class ApiContractError extends Error {
  constructor(
    readonly body: string,
    message: string,
  ) {
    super(message)
    this.name = "ApiContractError"
  }
}

/**
 * Server-side calls to `apps/api`, carrying the Clerk session as a bearer token.
 *
 * Bearer rather than forwarded cookies: web is :3000 and api is :3001, and a
 * cross-origin cookie that works in local development and in production
 * requires domain and SameSite arrangements that exist only to avoid reading a
 * token. `getToken()` hands one over.
 *
 * The three failure modes below are three different bugs in two different
 * processes, so they are three different error types. Collapsing them sends you
 * looking in the wrong place: an unreachable API and a schema mismatch have
 * nothing in common except that neither returned data.
 */
export async function apiFetch<T>(
  path: string,
  schema: ZodType<T>,
  init?: RequestInit,
): Promise<T> {
  const { getToken } = await auth()
  const token = await getToken()

  if (!token) {
    throw new ApiError(401, "", "No active Clerk session — getToken() returned null")
  }

  const url = `${API_URL}${path}`
  let response: Response
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        ...init?.headers,
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      // Auth-scoped responses are per-user; caching them at the framework layer
      // is how one tenant's data gets served to another.
      cache: "no-store",
    })
  } catch (cause: unknown) {
    throw new ApiUnreachableError(url, cause)
  }

  // Read once, as text. A non-ok response and an unparseable body both need it,
  // and a Response body can only be consumed a single time.
  const body = await response.text()

  if (!response.ok) {
    throw new ApiError(
      response.status,
      body,
      `${init?.method ?? "GET"} ${path} -> ${response.status}${body ? `: ${body.slice(0, 500)}` : ""}`,
    )
  }

  let json: unknown
  try {
    json = JSON.parse(body)
  } catch {
    throw new ApiContractError(body, `Response was not JSON: ${body.slice(0, 200)}`)
  }

  const parsed = schema.safeParse(json)
  if (!parsed.success) {
    throw new ApiContractError(
      body,
      `Response did not match the schema: ${JSON.stringify(parsed.error.issues)}`,
    )
  }

  return parsed.data
}
