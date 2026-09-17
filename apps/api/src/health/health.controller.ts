import { Controller, Get, HttpCode, HttpStatus } from "@nestjs/common"
import type { DatabaseHealthResponse, HealthResponse } from "@my-ba/shared"
import { Public } from "../auth/public.decorator"
import { DatabaseHealthService } from "./database-health.service"
import { HealthService } from "./health.service"

/**
 * Public: an orchestrator probing liveness has no session token, and a
 * readiness check that fails closed behind auth reports the wrong thing.
 */
@Public()
@Controller("health")
export class HealthController {
  constructor(
    private readonly health: HealthService,
    private readonly databaseHealth: DatabaseHealthService,
  ) {}

  @Get()
  check(): HealthResponse {
    return this.health.check()
  }

  /**
   * Separate from `/health` on purpose: liveness must not fail because a
   * dependency is down, or the orchestrator restarts a process that is fine.
   * Always 200 — the payload carries the verdict.
   */
  @Get("db")
  @HttpCode(HttpStatus.OK)
  async checkDatabase(): Promise<DatabaseHealthResponse> {
    return this.databaseHealth.check()
  }
}
