import {
  dbNow,
  type LatestStep,
  purchaseTasks,
  readLatestStep,
  readStageProgress,
  sumStageCost,
  type TenantTransaction,
} from "@my-ba/db"
import { estimateScreeningCostCeiling } from "@my-ba/htag-client"
import {
  type AuthContext,
  type ListPurchaseTasksResponse,
  type PurchaseTaskDetail,
  type SavePurchaseTaskRequest,
  type ScreeningCostEstimate,
  type ScreeningStageStatus,
  listPurchaseTasksResponseSchema,
  purchaseTaskDetailSchema,
  screeningCostEstimateSchema,
  screeningStageStatusSchema,
  taskStatusSchema,
} from "@my-ba/shared"
import { ConflictException, Injectable, NotFoundException } from "@nestjs/common"
import { desc, eq, sql } from "drizzle-orm"
import { TenantDatabaseService } from "../database/tenant-database.service"
import { deriveScreeningProgress, deriveScreeningStage, stageVersion } from "./screening-stage"

const summaryColumns = {
  id: purchaseTasks.id,
  name: purchaseTasks.name,
  status: purchaseTasks.status,
  lockedAt: purchaseTasks.lockedAt,
  clonedFromTaskId: purchaseTasks.clonedFromTaskId,
  createdAt: purchaseTasks.createdAt,
  updatedAt: purchaseTasks.updatedAt,
}

type SummaryRow = {
  id: string
  name: string
  status: string
  lockedAt: Date | null
  clonedFromTaskId: string | null
  createdAt: Date
  updatedAt: Date
}

/** Dates go on the wire as ISO strings, explicitly — the shared schema checks for exactly that. */
function serialiseSummary(row: SummaryRow) {
  return {
    ...row,
    lockedAt: row.lockedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

const detailColumns = { ...summaryColumns, criteria: purchaseTasks.criteria, dbNow: dbNow() }

/** `dbNow` is Postgres `now()`, read with the row; it tells a stalled stage (P1-6). */
type DetailRow = SummaryRow & { criteria: unknown; dbNow: Date }

/** What the detail shape needs beyond the task row: its latest screening attempt (P1-6). */
export interface StageSnapshot {
  step: LatestStep | null
  totalCostAud: string
}

const NO_STAGE: StageSnapshot = { step: null, totalCostAud: "0.0000" }

/** Reads the latest screening attempt and total spend, in the caller's transaction. */
export async function readStageSnapshot(
  tx: TenantTransaction,
  taskId: string,
): Promise<StageSnapshot> {
  const step = await readLatestStep(tx, taskId, "screening")
  if (!step) return NO_STAGE
  return { step, totalCostAud: await sumStageCost(tx, taskId, "screening") }
}

function serialiseDetail(
  { criteria, dbNow: now, ...summary }: DetailRow,
  stage: StageSnapshot = NO_STAGE,
): PurchaseTaskDetail {
  const screening = deriveScreeningStage({
    taskStatus: taskStatusSchema.parse(summary.status),
    taskUpdatedAt: summary.updatedAt,
    step: stage.step,
    now,
    totalCostAud: stage.totalCostAud,
  })
  return purchaseTaskDetailSchema.parse({ ...serialiseSummary(summary), criteria, screening })
}

/**
 * The aggregate root's API: reads (P0-6) and draft writes (P1-3).
 *
 * There is no `where tenant_id = …` here, on purpose. Isolation is the RLS
 * policy's job, and `TenantDatabaseService.run` is what arms it. An explicit
 * filter would make these queries pass even with a broken policy, hiding
 * exactly the failure that matters most in a multi-tenant table.
 */
@Injectable()
export class PurchaseTasksService {
  constructor(private readonly tenantDb: TenantDatabaseService) {}

  async list(auth: AuthContext): Promise<ListPurchaseTasksResponse> {
    const rows = await this.tenantDb.run(auth, (tx) =>
      tx.select(summaryColumns).from(purchaseTasks).orderBy(desc(purchaseTasks.updatedAt)),
    )

    return listPurchaseTasksResponseSchema.parse({ items: rows.map(serialiseSummary) })
  }

  /**
   * A task in another tenant is invisible under RLS, so it is a 404 exactly
   * like a task that never existed. The two are indistinguishable from outside
   * by design — a 403 would confirm the id exists.
   */
  async get(auth: AuthContext, taskId: string): Promise<PurchaseTaskDetail> {
    const found = await this.tenantDb.run(auth, async (tx) => {
      const rows = await tx
        .select(detailColumns)
        .from(purchaseTasks)
        .where(eq(purchaseTasks.id, taskId))
        .limit(1)
      const row = rows[0]
      if (!row) return null
      return { row, stage: await readStageSnapshot(tx, taskId) }
    })

    if (!found) {
      throw new NotFoundException(`Purchase task ${taskId} not found`)
    }

    return serialiseDetail(found.row, found.stage)
  }

  /**
   * Where the screening stage is, and its `version` (P1-6): what the detail
   * page polls instead of re-rendering. One unlocked read of two narrow rows;
   * 404 exactly as `get`.
   */
  async stageStatus(auth: AuthContext, taskId: string): Promise<ScreeningStageStatus> {
    const read = await this.tenantDb.run(auth, (tx) => readStageProgress(tx, taskId, "screening"))
    if (!read) throw new NotFoundException(`Purchase task ${taskId} not found`)
    const input = {
      taskStatus: taskStatusSchema.parse(read.task.status),
      taskUpdatedAt: read.task.updatedAt,
      step: read.step,
      now: read.task.dbNow,
    }
    const progress = deriveScreeningProgress(input)
    return screeningStageStatusSchema.parse(
      progress ?? { state: null, stalled: false, version: stageVersion(input, false) },
    )
  }

  /**
   * Create a task in `DRAFT` (P1-3). The body was parsed by the controller —
   * `run` intent has already proven the criteria complete. Either way the task
   * is saved as `DRAFT`; the web then calls `POST /:taskId/run` (P1-6), which
   * owns the transition to `SCREENING`.
   *
   * `tenant_id` and `user_id` come from the token (D45); RLS's WITH CHECK
   * rejects a row for any other tenant.
   */
  async create(auth: AuthContext, body: SavePurchaseTaskRequest): Promise<PurchaseTaskDetail> {
    const rows = await this.tenantDb.run(auth, (tx) =>
      tx
        .insert(purchaseTasks)
        .values({
          tenantId: auth.tenantId,
          userId: auth.userId,
          name: body.name,
          criteria: body.criteria,
        })
        .returning(detailColumns),
    )
    const row = rows[0]
    /* c8 ignore next 3 -- INSERT … RETURNING yields exactly one row or throws */
    if (!row) {
      throw new Error("Insert returned no row")
    }
    return serialiseDetail(row)
  }

  /**
   * Replace a draft's name and criteria (P1-3). Only `DRAFT` tasks are
   * editable: once screening starts, criteria are a record of what ran, and
   * changing them means cloning (D05). 404 for missing / other-tenant (D57),
   * 409 for a task that is no longer a draft.
   */
  async update(
    auth: AuthContext,
    taskId: string,
    body: SavePurchaseTaskRequest,
  ): Promise<PurchaseTaskDetail> {
    const result = await this.tenantDb.run(auth, async (tx) => {
      const current = await tx
        .select({ status: purchaseTasks.status, lockedAt: purchaseTasks.lockedAt })
        .from(purchaseTasks)
        .where(eq(purchaseTasks.id, taskId))
        .for("update")
        .limit(1)
      const task = current[0]
      if (!task) return { kind: "missing" } as const
      if (task.status !== "DRAFT" || task.lockedAt !== null) {
        return { kind: "not-draft", status: task.status } as const
      }
      const rows = await tx
        .update(purchaseTasks)
        .set({ name: body.name, criteria: body.criteria, updatedAt: sql`now()` })
        .where(eq(purchaseTasks.id, taskId))
        .returning(detailColumns)
      // A draft sent back by Reject & Adjust still shows its last attempt.
      return {
        kind: "updated",
        row: rows[0] ?? null,
        stage: await readStageSnapshot(tx, taskId),
      } as const
    })

    if (result.kind === "missing") {
      throw new NotFoundException(`Purchase task ${taskId} not found`)
    }
    if (result.kind === "not-draft") {
      throw new ConflictException(
        `Purchase task ${taskId} is ${result.status}; only DRAFT tasks can be edited (clone it instead)`,
      )
    }
    /* c8 ignore next 3 -- the row was locked FOR UPDATE in the same transaction */
    if (!result.row) {
      throw new NotFoundException(`Purchase task ${taskId} not found`)
    }
    return serialiseDetail(result.row, result.stage)
  }

  /**
   * Worst-case HtAG cost of one screening run, for the review step (P1-3).
   * Computed here because the rates live in `@my-ba/htag-client`, which the
   * web app must not import (P1-1 AC 11). No HtAG call, no key needed.
   */
  screeningEstimate(): ScreeningCostEstimate {
    return screeningCostEstimateSchema.parse(estimateScreeningCostCeiling())
  }
}
