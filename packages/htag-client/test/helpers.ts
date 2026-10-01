import type { HtagCallRecorder } from "@my-ba/shared"
import { readFileSync, readdirSync } from "node:fs"
import { createHtagClient } from "../src/client"
import type { HtagClientConfig } from "../src/config"
import type { HtagLogger } from "../src/logger"
import { InMemoryHtagCallRecorder } from "../src/testing/in-memory-recorder"

/** Recorded by scripts/htag/capture-fixtures.sh, or hand-written with `synthetic: true`. */
export interface Fixture {
  name: string
  synthetic: boolean
  request: { method: string; path: string; query: string | null; body: unknown }
  status: number
  headers: Record<string, string>
  body: unknown
}

const FIXTURES = new URL("./fixtures/", import.meta.url)

/** `loadFixture("summary")` or `loadFixture("synthetic/query-429")`. Always a fresh copy. */
export function loadFixture(name: string): Fixture {
  return JSON.parse(readFileSync(new URL(`${name}.json`, FIXTURES), "utf8")) as Fixture
}

/** Every captured (non-synthetic) fixture. */
export function capturedFixtures(): Fixture[] {
  return readdirSync(FIXTURES)
    .filter((file) => file.endsWith(".json"))
    .map((file) => loadFixture(file.replace(/\.json$/, "")))
}

export function loadOpenApi(): {
  paths: Record<string, Record<string, Record<string, unknown>>>
  components: { schemas: Record<string, { properties?: Record<string, unknown> }> }
} {
  return JSON.parse(
    readFileSync(new URL("../../../docs/htag/openapi.json", import.meta.url), "utf8"),
  )
}

/** Hop-by-hop and length headers are dropped; the body is re-serialised. */
const DROPPED_HEADERS =
  /^(content-length|content-encoding|transfer-encoding|x-amzn-remapped-content-length)$/

export function toResponse(
  fixture: Fixture,
  overrides: { body?: unknown; headers?: Record<string, string> } = {},
): Response {
  const headers = new Headers()
  for (const [name, value] of Object.entries(overrides.headers ?? fixture.headers)) {
    if (!DROPPED_HEADERS.test(name)) headers.set(name, value)
  }
  const body = overrides.body === undefined ? fixture.body : overrides.body
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status: fixture.status,
    headers,
  })
}

export interface FetchCall {
  url: URL
  init: RequestInit
}

/** A fetch that answers from `responder`, keeping every call. */
export function fakeFetch(
  responder: (call: FetchCall, index: number) => Response | Promise<Response>,
) {
  const calls: FetchCall[] = []
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const call = { url: new URL(String(input)), init: init ?? {} }
    calls.push(call)
    return responder(call, calls.length - 1)
  }) as typeof fetch
  return { fetch: impl, calls }
}

/** Fixed fixture responses, in order. Throws if the client asks for more. */
export function sequence(...responses: Array<() => Response>) {
  return fakeFetch((_, index) => {
    const next = responses[index]
    if (!next) throw new Error(`Unexpected request #${index + 1}`)
    return next()
  })
}

export interface LogEntry {
  level: "warn" | "error"
  message: string
  context: Record<string, unknown> | undefined
}

export function spyLogger(): HtagLogger & { entries: LogEntry[] } {
  const entries: LogEntry[] = []
  return {
    entries,
    warn: (message, context) => entries.push({ level: "warn", message, context }),
    error: (message, context) => entries.push({ level: "error", message, context }),
  }
}

/** Obviously fake: the client never validates the key's shape. */
export const TEST_API_KEY = "fixture-key"

export function makeClient(
  fetchImpl: typeof fetch,
  /** `recorder` replaces the in-memory ledger the client writes to (e.g. one that throws). */
  options: { config?: Partial<HtagClientConfig>; recorder?: HtagCallRecorder } = {},
) {
  const recorder = new InMemoryHtagCallRecorder()
  const logger = spyLogger()
  const sleeps: number[] = []
  const client = createHtagClient(
    { apiKey: TEST_API_KEY, baseDelayMs: 250, ...options.config },
    {
      recorder: options.recorder ?? recorder,
      logger,
      fetch: fetchImpl,
      sleep: async (ms) => {
        sleeps.push(ms)
      },
      random: () => 0,
    },
  )
  return { client, recorder, logger, sleeps }
}
