import { z } from "zod"
import { tenantJobSchema } from "./queue"

/** `POST /api/diagnostics/jobs` request body. The tenant is not in it, on purpose. */
export const enqueueDiagnosticsJobRequestSchema = z.object({
  message: z.string().trim().min(1).max(500),
})

export type EnqueueDiagnosticsJobRequest = z.infer<typeof enqueueDiagnosticsJobRequestSchema>

/** Payload of a job on `QUEUE_NAMES.DIAGNOSTICS`. */
export const diagnosticsJobSchema = tenantJobSchema.extend({
  message: z.string().min(1).max(500),
})

export type DiagnosticsJob = z.infer<typeof diagnosticsJobSchema>

/** What the diagnostics processor returns; visible as the job's return value in Bull Board. */
export const diagnosticsJobResultSchema = z.object({
  processedAt: z.iso.datetime(),
  /** Hostname and pid of the worker that ran it — proves it was not the API. */
  processedBy: z.string().min(1),
})

export type DiagnosticsJobResult = z.infer<typeof diagnosticsJobResultSchema>

export const enqueueDiagnosticsJobResponseSchema = z.object({
  jobId: z.string().min(1),
  queue: z.string().min(1),
})

export type EnqueueDiagnosticsJobResponse = z.infer<typeof enqueueDiagnosticsJobResponseSchema>
