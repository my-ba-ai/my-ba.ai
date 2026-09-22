import { ApiContractError, ApiError, ApiUnreachableError } from "@/lib/api-client"

/**
 * Which link in the web → API chain broke. The three are different bugs in
 * different processes (see `api-client.ts`); an error state that collapses them
 * sends you looking in the wrong terminal.
 */
export type ApiFailureStage = "unreachable" | "api" | "contract" | "unknown"

export interface ApiFailure {
  stage: ApiFailureStage
  /** HTTP status when the API answered, otherwise null. */
  status: number | null
  /** The raw line, for the mono block in the error state. Server-side only content. */
  detail: string
}

export const API_FAILURE_SUMMARY: Record<ApiFailureStage, string> = {
  unreachable:
    "The API did not answer. Check that apps/api is running on the port NEXT_PUBLIC_API_URL points at.",
  api: "The API answered and refused the request. Its terminal has the reason.",
  contract: "The API answered with a body this app could not accept. Nothing was shown from it.",
  unknown: "Something failed before the response could be read.",
}

export function classifyApiError(error: unknown): ApiFailure {
  if (error instanceof ApiUnreachableError) {
    return { stage: "unreachable", status: null, detail: error.message }
  }
  if (error instanceof ApiError) {
    return { stage: "api", status: error.status, detail: error.message }
  }
  if (error instanceof ApiContractError) {
    return { stage: "contract", status: null, detail: error.message }
  }
  return {
    stage: "unknown",
    status: null,
    detail: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
  }
}
