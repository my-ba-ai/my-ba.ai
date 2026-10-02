import { purchaseTasks } from "@my-ba/db"
import { estimateScreeningCostCeiling } from "@my-ba/htag-client"
import {
  type AuthContext,
  type ListPurchaseTasksResponse,
  type PurchaseTaskDetail,
  type SavePurchaseTaskRequest,
  type ScreeningCostEstimate,
  listPurchaseTasksResponseSchema,
  purchaseTaskDetailSchema,
  screeningCostEstimateSchema,
} from "@my-ba/shared"
import { ConflictException, Injectable, NotFoundException } from "@nestjs/common"
import { desc, eq, sql } from "drizzle-orm"
import { TenantDatabaseService } from "../database/tenant-database.service"

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

const detailColumns = { ...summaryColumns, criteria: purchaseTasks.criteria }

type DetailRow = SummaryRow & { criteria: unknown }

function serialiseDetail({ criteria, ...summary }: DetailRow): PurchaseTaskDetail {
  return purchaseTaskDetailSchema.parse({ ...serialiseSummary(summary), criteria })
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
    const row = await this.tenantDb.run(auth, async (tx) => {
      const rows = await tx
        .select({ ...summaryColumns, criteria: purchaseTasks.criteria })
        .from(purchaseTasks)
        .where(eq(purchaseTasks.id, taskId))
        .limit(1)
      return rows[0] ?? null
    })

    if (!row) {
      throw new NotFoundException(`Purchase task ${taskId} not found`)
    }

    return serialiseDetail(row)
  }

  /**
   * Create a task in `DRAFT` (P1-3). The body was parsed by the controller —
   * `run` intent has already proven the criteria complete. Either way the task
   * stays `DRAFT`: the transition to `SCREENING` is P1-6's.
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
      return { kind: "updated", row: rows[0] ?? null } as const
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
    return serialiseDetail(result.row)
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
