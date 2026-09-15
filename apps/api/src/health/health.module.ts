import { Module } from "@nestjs/common"
import { DatabaseHealthService } from "./database-health.service"
import { HealthController } from "./health.controller"
import { HealthService } from "./health.service"

@Module({
  controllers: [HealthController],
  providers: [HealthService, DatabaseHealthService],
  exports: [HealthService, DatabaseHealthService],
})
export class HealthModule {}
