import { Module } from "@nestjs/common"
import { QueueModule } from "../queue/queue.module"
import { PurchaseTasksController } from "./purchase-tasks.controller"
import { PurchaseTasksService } from "./purchase-tasks.service"
import { ScreeningRunService } from "./screening-run.service"

@Module({
  imports: [QueueModule],
  controllers: [PurchaseTasksController],
  providers: [PurchaseTasksService, ScreeningRunService],
})
export class PurchaseTasksModule {}
