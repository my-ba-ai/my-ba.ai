import { Module } from "@nestjs/common"
import { QueueModule } from "../queue/queue.module"
import { DiagnosticsController } from "./diagnostics.controller"
import { DiagnosticsService } from "./diagnostics.service"

@Module({
  imports: [QueueModule],
  controllers: [DiagnosticsController],
  providers: [DiagnosticsService],
})
export class DiagnosticsModule {}
