import { Controller, Get } from "@nestjs/common"
import type { AuthContext, CurrentUserResponse } from "@my-ba/shared"
import { AuthService } from "./auth.service"
import { CurrentUser } from "./current-user.decorator"

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /**
   * The P0-3 deliverable in one call: 401 without a token, and with one, a body
   * assembled from a row read inside the caller's tenant scope.
   */
  @Get("me")
  async me(@CurrentUser() auth: AuthContext): Promise<CurrentUserResponse> {
    return this.auth.currentUser(auth)
  }
}
