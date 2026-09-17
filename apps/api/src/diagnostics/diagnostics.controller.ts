import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common"
import {
  type AuthContext,
  type EnqueueDiagnosticsJobRequest,
  type EnqueueDiagnosticsJobResponse,
  enqueueDiagnosticsJobRequestSchema,
} from "@my-ba/shared"
import { CurrentUser } from "../auth/current-user.decorator"
import { ZodValidationPipe } from "../common/zod-validation.pipe"
import { DiagnosticsService } from "./diagnostics.service"

/**
 * P0-4 smoke route. Authenticated like everything else — it writes to Redis,
 * and "it's only diagnostics" is how an unauthenticated write path ships.
 */
@Controller("diagnostics")
export class DiagnosticsController {
  constructor(private readonly diagnostics: DiagnosticsService) {}

  @Post("jobs")
  @HttpCode(HttpStatus.ACCEPTED)
  async enqueue(
    @CurrentUser() auth: AuthContext,
    @Body(new ZodValidationPipe(enqueueDiagnosticsJobRequestSchema))
    body: EnqueueDiagnosticsJobRequest,
  ): Promise<EnqueueDiagnosticsJobResponse> {
    return this.diagnostics.enqueue(auth, body)
  }
}
