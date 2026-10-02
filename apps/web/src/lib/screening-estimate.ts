import { type ScreeningCostEstimate, screeningCostEstimateSchema } from "@my-ba/shared"
import { apiFetch } from "@/lib/api-client"
import { classifyApiError } from "@/lib/api-failure"

/**
 * The review step's cost ceiling (P1-3). Optional: if it fails the form still
 * works, so failure is logged and becomes `null` rather than an error page.
 */
export async function loadScreeningEstimate(): Promise<ScreeningCostEstimate | null> {
  try {
    return await apiFetch("/purchase-tasks/screening-estimate", screeningCostEstimateSchema)
  } catch (error: unknown) {
    console.error(
      `[tasks] screening estimate failed at stage "${classifyApiError(error).stage}":`,
      error,
    )
    return null
  }
}
