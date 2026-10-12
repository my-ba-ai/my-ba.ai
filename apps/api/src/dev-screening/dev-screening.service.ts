import { InjectQueue } from "@nestjs/bullmq"
import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import type { Queue } from "bullmq"
import { purchaseTasks } from "@my-ba/db"
import {
  type AuthContext,
  criteriaSchema,
  type EnqueueScreeningJobResponse,
  enqueueScreeningJobResponseSchema,
  QUEUE_NAMES,
  screeningJobSchema,
} from "@my-ba/shared"
import { eq } from "drizzle-orm"
import { TenantDatabaseService } from "../database/tenant-database.service"

export const SCREENING_JOB_NAME = "run"

/**
 * Pure, like `decideBullBoard`: on only when `DEV_SCREENING_TRIGGER=1` and
 * never in production. The user-facing Run button is P1-6 (D73).
 */
export function devScreeningEnabled(env: {
  nodeEnv: string | undefined
  flag: string | undefined
}): boolean {
  return env.nodeEnv !== "production" && env.flag === "1"
}

@Injectable()
export class DevScreeningService {
  private readonly logger = new Logger(DevScreeningService.name)

  constructor(
    @InjectQueue(QUEUE_NAMES.SCREENING) private readonly queue: Queue,
    private readonly database: TenantDatabaseService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Enqueues a screening run for one of the caller's tasks. The tenant comes
   * from the verified `AuthContext` (D45); a task outside it is a 404, same as
   * one that does not exist. Criteria must already be runnable, so a draft
   * fails here rather than as a failed step in the worker.
   *
   * One attempt, deduplicated by task while a run is waiting or active: every
   * run spends HtAG money, and the orchestrator retries a failed stage from
   * its checkpoint when re-enqueued.
   */
  async enqueue(auth: AuthContext, taskId: string): Promise<EnqueueScreeningJobResponse> {
    if (
      !devScreeningEnabled({
        nodeEnv: this.config.get<string>("NODE_ENV"),
        flag: this.config.get<string>("DEV_SCREENING_TRIGGER"),
      })
    ) {
      // Indistinguishable from an unmounted route, like Bull Board in production.
      throw new NotFoundException()
    }

    const [task] = await this.database.run(auth, (tx) =>
      tx
        .select({ criteria: purchaseTasks.criteria })
        .from(purchaseTasks)
        .where(eq(purchaseTasks.id, taskId)),
    )
    if (!task) throw new NotFoundException(`Purchase task ${taskId} not found`)
    const criteria = criteriaSchema.safeParse(task.criteria)
    if (!criteria.success) {
      throw new BadRequestException({
        message: "Task criteria are not runnable yet",
        issues: criteria.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      })
    }

    const payload = screeningJobSchema.parse({
      tenantId: auth.tenantId,
      requestedBy: auth.userId,
      requestedAt: new Date().toISOString(),
      taskId,
    })
    const job = await this.queue.add(SCREENING_JOB_NAME, payload, {
      attempts: 1,
      deduplication: { id: `screening-${taskId}` },
    })
    if (!job.id) throw new Error("BullMQ returned a job without an id")
    this.logger.log(`Enqueued ${this.queue.name}#${job.id} for task ${taskId}`)
    return enqueueScreeningJobResponseSchema.parse({
      jobId: job.id,
      queue: this.queue.name,
      taskId,
    })
  }
}
