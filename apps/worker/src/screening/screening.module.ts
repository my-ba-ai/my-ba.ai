import { Inject, Module, type OnApplicationShutdown } from "@nestjs/common"
import type { DatabasePool } from "@my-ba/db"
import type { Orchestrator } from "@my-ba/orchestrator"
import { QueueModule } from "../queue/queue.module"
import { orchestratorProvider, screeningPoolProvider } from "./orchestrator.provider"
import { ScreeningProcessor } from "./screening.processor"
import { ORCHESTRATOR, SCREENING_POOL } from "./screening.tokens"

@Module({
  imports: [QueueModule],
  providers: [screeningPoolProvider, orchestratorProvider, ScreeningProcessor],
})
export class ScreeningModule implements OnApplicationShutdown {
  constructor(
    @Inject(ORCHESTRATOR) private readonly orchestrator: Orchestrator,
    @Inject(SCREENING_POOL) private readonly pool: DatabasePool,
  ) {}

  async onApplicationShutdown(): Promise<void> {
    await this.orchestrator.close()
    await this.pool.end()
  }
}
