import { Module } from "@nestjs/common"
import { QueueModule } from "../queue/queue.module"
import { DiagnosticsProcessor } from "./diagnostics.processor"

@Module({
  imports: [QueueModule],
  providers: [DiagnosticsProcessor],
})
export class DiagnosticsModule {}
