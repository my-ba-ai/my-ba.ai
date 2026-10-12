import { Module } from "@nestjs/common"
import { QueueModule } from "../queue/queue.module"
import { DevScreeningController } from "./dev-screening.controller"
import { DevScreeningService } from "./dev-screening.service"

@Module({
  imports: [QueueModule],
  controllers: [DevScreeningController],
  providers: [DevScreeningService],
})
export class DevScreeningModule {}
