import { z } from "zod"
import { taskStatusSchema } from "../domain/task-status"

/**
 * `:taskId` route parameter. Validated before it reaches a query so a malformed
 * id is a 400 at the edge, not a Postgres `invalid input syntax for type uuid`.
 */
export const purchaseTaskIdParamSchema = z.uuid()

/**
 * One row of the task list (P0-6). Timestamps are ISO-8601 strings on the wire:
 * the API serialises `Date`s explicitly rather than trusting `JSON.stringify`,
 * so the contract is the same in both directions.
 *
 * Deliberately absent: shortlist count and criteria summary. Both need data
 * that does not exist until screening (P1-4) and the criteria schema (P1-3)
 * land; adding them now would mean inventing a shape Q02 has not settled.
 */
export const purchaseTaskSummarySchema = z.object({
  id: z.uuid(),
  name: z.string().min(1),
  status: taskStatusSchema,
  /** Non-null means the task is locked and its artifacts immutable (D04). */
  lockedAt: z.iso.datetime().nullable(),
  clonedFromTaskId: z.uuid().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})

export type PurchaseTaskSummary = z.infer<typeof purchaseTaskSummarySchema>

/**
 * `GET /api/purchase-tasks/:taskId`. `criteria` stays an opaque record while
 * Q02 is open — P1-3 replaces it with the real criteria schema.
 */
export const purchaseTaskDetailSchema = purchaseTaskSummarySchema.extend({
  criteria: z.record(z.string(), z.unknown()),
})

export type PurchaseTaskDetail = z.infer<typeof purchaseTaskDetailSchema>

/**
 * `GET /api/purchase-tasks`. Wrapped in `items` so pagination metadata can be
 * added beside it later without breaking the shape.
 */
export const listPurchaseTasksResponseSchema = z.object({
  items: z.array(purchaseTaskSummarySchema),
})

export type ListPurchaseTasksResponse = z.infer<typeof listPurchaseTasksResponseSchema>
