"use server"

import {
  type DraftCriteria,
  purchaseTaskDetailSchema,
  purchaseTaskIdParamSchema,
  type SaveIntent,
  savePurchaseTaskRequestSchema,
} from "@my-ba/shared"
import { redirect, unstable_rethrow } from "next/navigation"
import { ApiError, apiFetch } from "@/lib/api-client"
import { API_FAILURE_SUMMARY, classifyApiError } from "@/lib/api-failure"
import { describeRunFailure, requestScreeningRun } from "@/lib/screening-run"

/**
 * What the form sends. Looser than `SavePurchaseTaskRequest` on purpose: the
 * form holds draft criteria either way, and `run` completeness is decided by
 * the schema parse below, not by the caller's types.
 */
export interface SaveTaskInput {
  intent: SaveIntent
  name: string
  criteria: DraftCriteria
}

export interface SaveTaskFailure {
  ok: false
  message: string
  issues: Array<{ path: string; message: string }>
}

const failure = (message: string, issues: SaveTaskFailure["issues"] = []): SaveTaskFailure => ({
  ok: false,
  message,
  issues,
})

/** Nest's 400 body from `ZodValidationPipe`: `{ message, issues: [{ path, message }] }`. */
function issuesFrom(body: string): SaveTaskFailure["issues"] {
  try {
    const parsed: unknown = JSON.parse(body)
    if (
      parsed &&
      typeof parsed === "object" &&
      "issues" in parsed &&
      Array.isArray(parsed.issues)
    ) {
      return parsed.issues.filter(
        (i): i is { path: string; message: string } =>
          typeof i?.path === "string" && typeof i?.message === "string",
      )
    }
  } catch {
    // Not JSON: fall through to the generic message.
  }
  return []
}

/**
 * Create (`taskId === null`) or update a draft purchase task (P1-3), then go
 * to its detail page. With `intent: "run"` the criteria must be complete, and
 * once saved the screening run is requested too (P1-6, "Create Task & Run
 * Screening"). Runs on the server so the Clerk token never reaches the
 * browser (same path as every read, `apiFetch`). The payload is parsed here
 * as well as in the API: a Server Action is a public endpoint.
 *
 * Returns only on failure; success redirects.
 */
export async function saveTask(
  taskId: string | null,
  input: SaveTaskInput,
): Promise<SaveTaskFailure> {
  if (taskId !== null && !purchaseTaskIdParamSchema.safeParse(taskId).success) {
    return failure("That task id is not valid.")
  }
  const parsed = savePurchaseTaskRequestSchema.safeParse(input)
  if (!parsed.success) {
    return failure(
      "Some values are not valid.",
      parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    )
  }

  let savedId: string
  try {
    const task = await apiFetch(
      taskId === null ? "/purchase-tasks" : `/purchase-tasks/${taskId}`,
      purchaseTaskDetailSchema,
      { method: taskId === null ? "POST" : "PATCH", body: JSON.stringify(parsed.data) },
    )
    savedId = task.id
  } catch (error: unknown) {
    // Next's own control-flow errors (dynamic-usage bailout during prerender,
    // notFound, redirect) must reach Next, not be logged as API failures.
    unstable_rethrow(error)
    if (error instanceof ApiError) {
      if (error.status === 400) {
        return failure("The API rejected some values.", issuesFrom(error.body))
      }
      if (error.status === 404) return failure("This task no longer exists.")
      if (error.status === 409) {
        return failure(
          "This task is no longer a draft, so its criteria can't change. Clone it instead.",
        )
      }
    }
    const classified = classifyApiError(error)
    console.error(`[tasks] save failed at stage "${classified.stage}":`, error)
    return failure(API_FAILURE_SUMMARY[classified.stage])
  }

  if (parsed.data.intent === "run") {
    // The task is saved either way. If the run request fails, the detail page
    // still offers Run screening, so land there rather than back on a form
    // that would create the task a second time.
    try {
      await requestScreeningRun(savedId)
    } catch (error: unknown) {
      unstable_rethrow(error)
      console.error(
        `[tasks] saved ${savedId} but the run was refused: ${describeRunFailure(error)}`,
      )
    }
  }

  redirect(`/tasks/${savedId}`)
}
