import { type ScreeningStageStatus, screeningStageStatusSchema } from "@my-ba/shared"
import { API_URL } from "@/lib/api-url"

/*
 * The detail page's stage poll (P1-6), called from the browser. It asks the
 * API directly with the Clerk session token the browser already holds, so a
 * poll that finds nothing new costs one indexed read and a 304, with no
 * server render. The page re-renders only once `version` moves.
 */

export type StagePoll = { changed: false } | { changed: true; status: ScreeningStageStatus }

/** The API answered the poll with something other than 200 / 304. */
export class StagePollError extends Error {
  constructor(readonly status: number) {
    super(`GET stage -> ${status}`)
    this.name = "StagePollError"
  }
}

/**
 * `GET /purchase-tasks/:taskId/stage` with `If-None-Match: "<version>"`.
 * Throws `StagePollError` on a non-2xx answer, a `ZodError` on a body that
 * breaks the contract, and lets a network or abort error through.
 */
export async function pollStageStatus(
  taskId: string,
  version: string,
  token: string,
  signal?: AbortSignal,
): Promise<StagePoll> {
  const response = await fetch(`${API_URL}/purchase-tasks/${taskId}/stage`, {
    headers: { authorization: `Bearer ${token}`, "if-none-match": `"${version}"` },
    // Per user; a conditional request the browser must not answer from cache.
    cache: "no-store",
    signal,
  })
  if (response.status === 304) return { changed: false }
  if (!response.ok) throw new StagePollError(response.status)
  const status = screeningStageStatusSchema.parse(await response.json())
  return status.version === version ? { changed: false } : { changed: true, status }
}
