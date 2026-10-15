import { Inject, Logger } from "@nestjs/common"
import { OnWorkerEvent, Processor, WorkerHost } from "@nestjs/bullmq"
import { type Job, UnrecoverableError } from "bullmq"
import {
  handleScreeningJob,
  type Orchestrator,
  ScreeningJobRejectedError,
  type StageResult,
  type StageSync,
} from "@my-ba/orchestrator"
import { QUEUE_NAMES, type ScreeningJob, screeningJobSchema } from "@my-ba/shared"
import { ORCHESTRATOR, STAGE_SYNC } from "./screening.tokens"

/** What the job returns; visible in Bull Board. */
export interface ScreeningJobResult {
  action: ScreeningJob["action"]
  status: StageResult["status"]
  gate?: string
}

/**
 * BullMQ adapter for the screening stage (P1-4, P1-6). What a job does —
 * which orchestrator call, and the status / gate sync after it — is
 * `handleScreeningJob` in `@my-ba/orchestrator`, so the integration suite
 * there runs the same code against Postgres.
 *
 * Concurrency 1: every screen spends money. Nothing here is retried by
 * BullMQ (`UnrecoverableError`): a failed stage is retried by the user once
 * the cause is fixed (P1-4 AC 5), and a rejected job can't succeed on retry.
 */
@Processor(QUEUE_NAMES.SCREENING, { concurrency: 1 })
export class ScreeningProcessor extends WorkerHost {
  private readonly logger = new Logger(ScreeningProcessor.name)

  constructor(
    @Inject(ORCHESTRATOR) private readonly orchestrator: Orchestrator,
    @Inject(STAGE_SYNC) private readonly sync: StageSync,
  ) {
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
    const payload = parsed.data
    this.logger.log(
      `Job ${job.name}#${job.id ?? "?"} ${payload.action} tenant=${payload.tenantId} task=${payload.taskId}`,
    )

    let result: StageResult
    try {
      result = await handleScreeningJob(
        {
          orchestrator: this.orchestrator,
          sync: this.sync,
          logger: { warn: (message) => this.logger.warn(message) },
        },
        payload,
      )
    } catch (error) {
      if (error instanceof ScreeningJobRejectedError) throw new UnrecoverableError(error.message)
      throw error
    }

    if (result.status === "failed") {
      throw new UnrecoverableError(
        `screening failed${result.reason ? ` (${result.reason})` : ""}: ${result.error}`,
      )
    }
    this.logger.log(`Task ${payload.taskId}: ${result.status}`)
    return {
      action: payload.action,
      status: result.status,
      ...(result.status === "awaiting_approval" ? { gate: result.gate.kind } : {}),
    }
  }

  @OnWorkerEvent("failed")
  onFailed(job: Job | undefined, error: Error): void {
    this.logger.error(`Job ${job?.name ?? "?"}#${job?.id ?? "?"} failed: ${error.message}`)
  }
}
