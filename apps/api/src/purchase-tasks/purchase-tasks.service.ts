import { Injectable, NotFoundException } from "@nestjs/common"
import { desc, eq } from "drizzle-orm"
import {
  type AuthContext,
  type ListPurchaseTasksResponse,
  type PurchaseTaskDetail,
  listPurchaseTasksResponseSchema,
  purchaseTaskDetailSchema,
} from "@my-ba/shared"
import { purchaseTasks } from "@my-ba/db"
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

/**
 * Read side of the aggregate root (P0-6). Write paths arrive with P1-3.
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

    const { criteria, ...summary } = row
    return purchaseTaskDetailSchema.parse({ ...serialiseSummary(summary), criteria })
  }
}
