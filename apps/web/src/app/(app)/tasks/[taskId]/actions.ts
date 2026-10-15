"use server"

import { purchaseTaskIdParamSchema } from "@my-ba/shared"
import { refresh } from "next/cache"
import { unstable_rethrow } from "next/navigation"
import { describeRunFailure, requestScreeningRun } from "@/lib/screening-run"

export interface RunScreeningFailure {
  ok: false
  message: string
}

/**
 * Run screening, or Retry a failed attempt (P1-6), from the task detail page.
 * Refreshes the page on success so it shows the queued stage; returns a
 * message on failure.
 */
export async function runScreening(taskId: string): Promise<RunScreeningFailure | undefined> {
  if (!purchaseTaskIdParamSchema.safeParse(taskId).success) {
    return { ok: false, message: "That task id is not valid." }
  }
  try {
    await requestScreeningRun(taskId)
  } catch (error: unknown) {
    unstable_rethrow(error)
    return { ok: false, message: describeRunFailure(error) }
  }
  refresh()
  return undefined
}
