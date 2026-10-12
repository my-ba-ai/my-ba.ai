import { Controller, HttpCode, HttpStatus, Param, Post } from "@nestjs/common"
import {
  type AuthContext,
  type EnqueueScreeningJobResponse,
  purchaseTaskIdParamSchema,
} from "@my-ba/shared"
import { CurrentUser } from "../auth/current-user.decorator"
import { ZodValidationPipe } from "../common/zod-validation.pipe"
import { DevScreeningService } from "./dev-screening.service"

/**
 * P1-4 dev-only trigger: `POST /api/dev/screening/:taskId` enqueues a
 * screening run. Authenticated like every route, and a 404 unless
 * `DEV_SCREENING_TRIGGER=1` outside production (D73).
 */
@Controller("dev/screening")
export class DevScreeningController {
  constructor(private readonly screening: DevScreeningService) {}

  @Post(":taskId")
  @HttpCode(HttpStatus.ACCEPTED)
  async enqueue(
    @CurrentUser() auth: AuthContext,
    @Param("taskId", new ZodValidationPipe(purchaseTaskIdParamSchema)) taskId: string,
  ): Promise<EnqueueScreeningJobResponse> {
    return this.screening.enqueue(auth, taskId)
  }
}
