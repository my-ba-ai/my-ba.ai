import { Inject, Logger } from "@nestjs/common"
import { OnWorkerEvent, Processor, WorkerHost } from "@nestjs/bullmq"
import { type Job, UnrecoverableError } from "bullmq"
import type { Orchestrator, StageResult } from "@my-ba/orchestrator"
import { QUEUE_NAMES, screeningJobSchema } from "@my-ba/shared"
import { ORCHESTRATOR } from "./screening.tokens"

/** What the job returns; visible in Bull Board. */
export interface ScreeningJobResult {
  status: StageResult["status"]
  gate?: string
  reason?: string
}

/**
 * Runs the screening stage for a task (P1-4, D73). The orchestrator does the
 * work and owns idempotency: a task already paused at a gate returns that gate
 * without another HtAG call, and a failed one retries from its checkpoint.
 *
 * Concurrency 1: every screen spends money, and two screens of the same task
 * in parallel would each pay. The producer also deduplicates by task.
 *
 * A failed stage is not retried by BullMQ (`UnrecoverableError`): retrying a
 * quota or balance failure immediately cannot succeed, and each attempt may
 * bill. Re-enqueue once the cause is fixed (AC 5).
 */
@Processor(QUEUE_NAMES.SCREENING, { concurrency: 1 })
export class ScreeningProcessor extends WorkerHost {
  private readonly logger = new Logger(ScreeningProcessor.name)

  constructor(@Inject(ORCHESTRATOR) private readonly orchestrator: Orchestrator) {
    super()
  }

  async process(job: Job): Promise<ScreeningJobResult> {
    const parsed = screeningJobSchema.safeParse(job.data)
    if (!parsed.success) {
      throw new UnrecoverableError(
        `Invalid ${QUEUE_NAMES.SCREENING} payload: ${parsed.error.issues
          .map((issue) => `${issue.path.join(".") || "(root)"} ${issue.message}`)
          .join("; ")}`,
      )
    }
    const { tenantId, taskId } = parsed.data
    this.logger.log(`Job ${job.name}#${job.id ?? "?"} tenant=${tenantId} task=${taskId}`)

    const result = await this.orchestrator.runStage({ tenantId, taskId, stage: "screening" })

    if (result.status === "failed") {
      throw new UnrecoverableError(
        `screening failed${result.reason ? ` (${result.reason})` : ""}: ${result.error}`,
      )
    }
    this.logger.log(`Task ${taskId}: ${result.status}`)
    return {
      status: result.status,
      ...(result.status === "awaiting_approval" ? { gate: result.gate.kind } : {}),
    }
  }

  @OnWorkerEvent("failed")
  onFailed(job: Job | undefined, error: Error): void {
    this.logger.error(`Job ${job?.name ?? "?"}#${job?.id ?? "?"} failed: ${error.message}`)
  }
}
