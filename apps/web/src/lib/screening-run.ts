import { purchaseTaskDetailSchema } from "@my-ba/shared"
import { ApiError, apiFetch } from "@/lib/api-client"
import { API_FAILURE_SUMMARY, classifyApiError } from "@/lib/api-failure"

/*
 * Server-side helpers for the screening run (P1-6), shared by the detail
 * page's action and "Create Task & Run Screening". Deliberately not a
 * "use server" module: every export of one is a public endpoint.
 */

/**
 * `POST /purchase-tasks/:taskId/run` (P1-6). Throws on failure; the callers
 * turn that into their own message. Server-only: the Clerk token stays here.
 */
export async function requestScreeningRun(taskId: string): Promise<void> {
  await apiFetch(`/purchase-tasks/${taskId}/run`, purchaseTaskDetailSchema, {
    method: "POST",
    body: "{}",
  })
}

/** What to tell the investor when a run request fails. */
export function describeRunFailure(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 400) return "These criteria aren't complete enough to run yet."
    if (error.status === 404) return "This task no longer exists."
    if (error.status === 409) {
      return "This task is already screening, or has moved past screening. Refresh to see where it is."
    }
  }
  const classified = classifyApiError(error)
  console.error(`[tasks] run failed at stage "${classified.stage}":`, error)
  return API_FAILURE_SUMMARY[classified.stage]
}
