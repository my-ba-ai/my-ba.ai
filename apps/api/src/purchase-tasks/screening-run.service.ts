import { InjectQueue } from "@nestjs/bullmq"
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common"
import type { Queue } from "bullmq"
import {
  changeTaskStatus,
  decideGate,
  type LatestStep,
  type LockedTask,
  lockTask as lockTaskRow,
  readLatestStep,
  type TenantTransaction,
  touchLatestStep,
  touchTask,
} from "@my-ba/db"
import {
  type ApproveScreeningRequest,
  type AuthContext,
  criteriaSchema,
  type PurchaseTaskDetail,
  QUEUE_NAMES,
  type RejectScreeningRequest,
  type ScreeningJob,
  screeningApprovalGateSchema,
  screeningJobSchema,
  taskStatusSchema,
} from "@my-ba/shared"
import { TenantDatabaseService } from "../database/tenant-database.service"
import { PurchaseTasksService } from "./purchase-tasks.service"
import { deriveScreeningProgress } from "./screening-stage"

export const SCREENING_JOB_NAMES = { run: "run", approve: "approve" } as const

/**
 * Run, approve and Reject & Adjust for the screening stage (P1-6, D75).
 *
 * The API only reads and writes Postgres; the worker owns the graph. Each
 * request locks the task row (`FOR UPDATE`), checks the task and its latest
 * attempt are in the state the action needs, writes, and commits before
 * anything is enqueued. Those checks are what stop a double click spending
 * twice, so jobs are not deduplicated in BullMQ: a deduplicated add drops the
 * job silently, which would leave the task looking queued forever.
 *
 * Every refusal happens before the enqueue (AC 8). 404 for a task the caller
 * cannot see (missing and other-tenant alike), 409 for one in the wrong state.
 */
@Injectable()
export class ScreeningRunService {
  private readonly logger = new Logger(ScreeningRunService.name)

  constructor(
    @InjectQueue(QUEUE_NAMES.SCREENING) private readonly queue: Queue,
    private readonly tenantDb: TenantDatabaseService,
    private readonly tasks: PurchaseTasksService,
  ) {}

  /**
   * `POST /:taskId/run`. From `DRAFT` (first run, or the re-run after Reject &
   * Adjust): criteria must be runnable, then `DRAFT → SCREENING`. From
   * `SCREENING` only when the latest attempt failed (Retry, P1-4 AC 5) or the
   * stage is stalled (see `deriveScreeningProgress`). The run job that follows
   * reconciles: it re-mirrors a gate the thread is paused at, finishes an
   * approval whose sync was lost, or continues an attempt that never finished.
   */
  async run(auth: AuthContext, taskId: string): Promise<PurchaseTaskDetail> {
    const outcome = await this.tenantDb.run(auth, async (tx) => {
      const task = await lockTask(tx, taskId)
      if (task.lockedAt !== null) conflict(taskId, "is locked")

      if (task.status === "DRAFT") {
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
        // The row is locked, so this cannot lose a race; checked anyway.
        if (!(await changeTaskStatus(tx, taskId, "DRAFT", "SCREENING"))) {
          conflict(taskId, "changed while starting")
        }
        return { movedFromDraft: true }
      }

      if (task.status === "SCREENING") {
        const progress = deriveScreeningProgress({
          taskStatus: "SCREENING",
          taskUpdatedAt: task.updatedAt,
          step: await readLatestStep(tx, taskId, "screening"),
          now: task.dbNow,
        })
        if (progress?.state !== "failed" && !progress?.stalled) {
          conflict(taskId, "is already screening")
        }
        await touchTask(tx, taskId)
        return { movedFromDraft: false }
      }

      return conflict(taskId, `is ${task.status}`)
    })

    try {
      await this.enqueue(auth, taskId, { action: "run" })
    } catch (error) {
      // Put the task back so Run is offered again rather than a task stuck
      // "queued" with nothing in the queue. A retry from SCREENING needs no
      // undo: the failed attempt shows as failed again once its row moves.
      if (outcome.movedFromDraft) {
        await this.tenantDb.run(auth, (tx) => changeTaskStatus(tx, taskId, "SCREENING", "DRAFT"))
      } else {
        await this.tenantDb.run(auth, (tx) => touchLatestStep(tx, taskId, "screening"))
      }
      throw error
    }
    return this.tasks.get(auth, taskId)
  }

  /**
   * `POST /:taskId/approve`. Only an `awaiting` approval gate (too-broad has no
   * approve, D42), only once. `keep` must name ranked suburbs of that gate.
   */
  async approve(
    auth: AuthContext,
    taskId: string,
    body: ApproveScreeningRequest,
  ): Promise<PurchaseTaskDetail> {
    await this.tenantDb.run(auth, async (tx) => {
      const task = await lockTask(tx, taskId)
      const step = await awaitingGate(tx, taskId, task)
      if (step.gateKind !== "SCREENING_APPROVAL") {
        conflict(taskId, "is too broad to approve; adjust the criteria and run again")
      }
      const gate = screeningApprovalGateSchema.parse(step.gatePayload)
      if (body.keep) {
        const ranked = new Set(gate.rankedSuburbs.map((suburb) => suburb.areaId))
        const unknown = body.keep.filter((id) => !ranked.has(id))
        if (unknown.length > 0) {
          throw new BadRequestException({
            message: "keep names suburbs that are not in this ranking",
            unknownAreaIds: unknown,
          })
        }
      }
      // Marks the approval as requested (the task now reads as queued).
      await touchTask(tx, taskId)
    })

    try {
      await this.enqueue(auth, taskId, {
        action: "approve",
        ...(body.keep ? { keep: body.keep } : {}),
        ...(body.note ? { note: body.note } : {}),
      })
    } catch (error) {
      await this.tenantDb.run(auth, (tx) => touchLatestStep(tx, taskId, "screening"))
      throw error
    }
    return this.tasks.get(auth, taskId)
  }

  /**
   * `POST /:taskId/reject` — Reject & Adjust. Records the rejection on the
   * attempt's gate and sends the task back to `DRAFT`, in one transaction. No
   * job: the thread stays paused at its gate until the next Run, so nothing
   * is screened (or billed) before the criteria are edited (D75).
   */
  async reject(
    auth: AuthContext,
    taskId: string,
    body: RejectScreeningRequest,
  ): Promise<PurchaseTaskDetail> {
    await this.tenantDb.run(auth, async (tx) => {
      const task = await lockTask(tx, taskId)
      const step = await awaitingGate(tx, taskId, task)
      const decided = await decideGate(tx, {
        analysisStepId: step.id,
        status: "rejected",
        decision: { approved: false, ...(body.note ? { note: body.note } : {}) },
        decidedBy: auth.userId,
      })
      if (!decided || !(await changeTaskStatus(tx, taskId, "SCREENING", "DRAFT"))) {
        conflict(taskId, "changed while rejecting")
      }
    })
    return this.tasks.get(auth, taskId)
  }

  private async enqueue(
    auth: AuthContext,
    taskId: string,
    action: { action: "run" } | { action: "approve"; keep?: string[]; note?: string },
  ): Promise<void> {
    const payload: ScreeningJob = screeningJobSchema.parse({
      tenantId: auth.tenantId,
      requestedBy: auth.userId,
      requestedAt: new Date().toISOString(),
      taskId,
      ...action,
    })
    // One attempt: every screen may bill, and a failed stage is retried
    // from its checkpoint by the user's Retry, not by BullMQ.
    const job = await this.queue.add(SCREENING_JOB_NAMES[payload.action], payload, { attempts: 1 })
    this.logger.log(`Enqueued ${this.queue.name}#${job.id ?? "?"} ${payload.action} task=${taskId}`)
  }
}

async function lockTask(tx: TenantTransaction, taskId: string): Promise<LockedTask> {
  const task = await lockTaskRow(tx, taskId)
  if (!task) throw new NotFoundException(`Purchase task ${taskId} not found`)
  return task
}

/** The latest attempt, if it is paused at a gate nobody has answered or asked to answer. */
async function awaitingGate(
  tx: TenantTransaction,
  taskId: string,
  task: LockedTask,
): Promise<LatestStep> {
  if (taskStatusSchema.parse(task.status) !== "SCREENING") {
    conflict(taskId, `is ${task.status}, not awaiting approval`)
  }
  const step = await readLatestStep(tx, taskId, "screening")
  if (!step || step.gateStatus !== "awaiting" || requestedSince(task.updatedAt, step)) {
    conflict(taskId, "is not awaiting approval")
  }
  return step
}

/** The API asked the worker for something after the attempt last changed (see `deriveScreeningStage`). */
function requestedSince(taskUpdatedAt: Date, step: LatestStep): boolean {
  return taskUpdatedAt.getTime() > step.updatedAt.getTime()
}

function conflict(taskId: string, reason: string): never {
  throw new ConflictException(`Purchase task ${taskId} ${reason}`)
}
