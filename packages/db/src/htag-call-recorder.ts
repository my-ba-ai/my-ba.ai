import { htagCallRecordSchema, type HtagCallRecord, type HtagCallRecorder } from "@my-ba/shared"
import { z } from "zod"
import type { Database } from "./client"
import { htagCalls } from "./schema"
import { withTenant } from "./tenant"

/** Who the spend is recorded against. Bound once, when the recorder is built (D63). */
export const htagCallScopeSchema = z.object({
  tenantId: z.uuid(),
  /** Null for calls made outside a task. */
  taskId: z.uuid().nullable().default(null),
  /** Null until `analysis_steps` exists (P1-4 / P1-6). */
  analysisStepId: z.uuid().nullable().default(null),
})

export type HtagCallScope = z.input<typeof htagCallScopeSchema>

/**
 * Postgres implementation of the HtAG spend ledger (D63).
 *
 * Each `record` opens its own `withTenant` transaction on the pool. It never
 * joins the caller's transaction, so a spend record survives the caller rolling
 * back — the money was spent either way. Errors propagate to the client, which
 * logs them and still returns the data it paid for.
 */
export function createHtagCallRecorder(db: Database, scope: HtagCallScope): HtagCallRecorder {
  const { tenantId, taskId, analysisStepId } = htagCallScopeSchema.parse(scope)

  return {
    async record(call: HtagCallRecord): Promise<void> {
      const parsed = htagCallRecordSchema.parse(call)
      await withTenant(db, tenantId, (tx) =>
        tx.insert(htagCalls).values({
          tenantId,
          taskId,
          analysisStepId,
          endpoint: parsed.endpoint,
          requestJson: parsed.request,
          rowsReturned: parsed.rowsReturned,
          tier: parsed.tier,
          costAud: parsed.costAud,
          costSource: parsed.costSource,
          billedUnits: parsed.billedUnits,
          billingBalanceAud: parsed.billingBalanceAud,
          billingTier: parsed.billingTier,
          statusCode: parsed.statusCode,
        }),
      )
    },
  }
}
