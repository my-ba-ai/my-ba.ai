import { hostname } from "node:os"
import { OnWorkerEvent, Processor, WorkerHost } from "@nestjs/bullmq"
import { Logger } from "@nestjs/common"
import { type Job, UnrecoverableError } from "bullmq"
import {
  diagnosticsJobResultSchema,
  diagnosticsJobSchema,
  type DiagnosticsJobResult,
  QUEUE_NAMES,
} from "@my-ba/shared"

/**
 * P0-4 smoke processor: parse, log, return. The shape every real processor
 * follows — parse the payload before doing anything, and treat a payload that
 * does not parse as unrecoverable, because retrying it three times will not
 * make it valid.
 *
 * A real processor would now call `withTenant(db, payload.tenantId, ...)`;
 * this one touches no data, so the worker still has no database pool.
 */
@Processor(QUEUE_NAMES.DIAGNOSTICS)
export class DiagnosticsProcessor extends WorkerHost {
  private readonly logger = new Logger(DiagnosticsProcessor.name)

  async process(job: Job): Promise<DiagnosticsJobResult> {
    const parsed = diagnosticsJobSchema.safeParse(job.data)
    if (!parsed.success) {
      throw new UnrecoverableError(
        `Invalid ${QUEUE_NAMES.DIAGNOSTICS} payload: ${parsed.error.issues
          .map((issue) => `${issue.path.join(".") || "(root)"} ${issue.message}`)
          .join("; ")}`,
      )
    }

    const payload = parsed.data
    const attempt = job.attemptsMade + 1
    this.logger.log(
      `Job ${job.name}#${job.id ?? "?"} tenant=${payload.tenantId} attempt=${attempt}: ${payload.message}`,
    )

    return diagnosticsJobResultSchema.parse({
      processedAt: new Date().toISOString(),
      processedBy: `${hostname()}:${process.pid}`,
    })
  }

  @OnWorkerEvent("failed")
  onFailed(job: Job | undefined, error: Error): void {
    this.logger.error(`Job ${job?.name ?? "?"}#${job?.id ?? "?"} failed: ${error.message}`)
  }
}
