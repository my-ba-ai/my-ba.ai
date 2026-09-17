import { hostname } from "node:os"
import { InjectQueue } from "@nestjs/bullmq"
import { Injectable, Logger } from "@nestjs/common"
import type { Queue } from "bullmq"
import {
  type AuthContext,
  diagnosticsJobSchema,
  type EnqueueDiagnosticsJobRequest,
  type EnqueueDiagnosticsJobResponse,
  enqueueDiagnosticsJobResponseSchema,
  QUEUE_NAMES,
} from "@my-ba/shared"

export const DIAGNOSTICS_JOB_NAME = "ping"

@Injectable()
export class DiagnosticsService {
  private readonly logger = new Logger(DiagnosticsService.name)

  constructor(@InjectQueue(QUEUE_NAMES.DIAGNOSTICS) private readonly queue: Queue) {}

  /**
   * The tenant comes from the verified `AuthContext`, exactly as it does for a
   * query. The payload is parsed on the way in, so a producer bug fails here
   * with a stack trace rather than in the worker with none.
   */
  async enqueue(
    auth: AuthContext,
    request: EnqueueDiagnosticsJobRequest,
  ): Promise<EnqueueDiagnosticsJobResponse> {
    const payload = diagnosticsJobSchema.parse({
      tenantId: auth.tenantId,
      requestedBy: auth.userId,
      requestedAt: new Date().toISOString(),
      message: request.message,
    })

    const job = await this.queue.add(DIAGNOSTICS_JOB_NAME, payload)
    if (!job.id) throw new Error("BullMQ returned a job without an id")

    this.logger.log(`Enqueued ${this.queue.name}#${job.id} from ${hostname()}`)
    return enqueueDiagnosticsJobResponseSchema.parse({ jobId: job.id, queue: this.queue.name })
  }
}
