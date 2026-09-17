import type { Request } from "express"
import type { AuthContext } from "@my-ba/shared"

/**
 * What the guard attaches. Optional because the same type describes a request
 * to a `@Public()` route, where nothing was resolved.
 */
export interface AuthenticatedRequest extends Request {
  auth?: AuthContext
}
