import { createParamDecorator, type ExecutionContext, UnauthorizedException } from "@nestjs/common"
import type { AuthContext } from "@my-ba/shared"
import type { AuthenticatedRequest } from "./authenticated-request"

/**
 * The resolved identity for this request. Throws rather than returning
 * undefined: reaching for the current user on a route the guard did not protect
 * is a wiring mistake, and the alternative is a handler that quietly treats an
 * anonymous request as a valid one.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthContext => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>()
    if (!request.auth) {
      throw new UnauthorizedException(
        "No authenticated identity on this request. Is the route marked @Public()?",
      )
    }
    return request.auth
  },
)
