import { Controller, Get, Param } from "@nestjs/common"
import {
  type AuthContext,
  type ListPurchaseTasksResponse,
  type PurchaseTaskDetail,
  purchaseTaskIdParamSchema,
} from "@my-ba/shared"
import { CurrentUser } from "../auth/current-user.decorator"
import { ZodValidationPipe } from "../common/zod-validation.pipe"
import { PurchaseTasksService } from "./purchase-tasks.service"

@Controller("purchase-tasks")
export class PurchaseTasksController {
  constructor(private readonly tasks: PurchaseTasksService) {}

  @Get()
  async list(@CurrentUser() auth: AuthContext): Promise<ListPurchaseTasksResponse> {
    return this.tasks.list(auth)
  }

  @Get(":taskId")
  async get(
    @CurrentUser() auth: AuthContext,
    @Param("taskId", new ZodValidationPipe(purchaseTaskIdParamSchema)) taskId: string,
  ): Promise<PurchaseTaskDetail> {
    return this.tasks.get(auth, taskId)
  }
}
