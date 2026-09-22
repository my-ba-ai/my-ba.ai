import { Module } from "@nestjs/common"
import { PurchaseTasksController } from "./purchase-tasks.controller"
import { PurchaseTasksService } from "./purchase-tasks.service"

@Module({
  controllers: [PurchaseTasksController],
  providers: [PurchaseTasksService],
})
export class PurchaseTasksModule {}
