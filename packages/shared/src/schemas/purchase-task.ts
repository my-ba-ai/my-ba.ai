import { z } from "zod"
import { taskStatusSchema } from "../domain/task-status"
import { draftCriteriaSchema } from "./criteria"

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
 * Deliberately absent: shortlist count and criteria summary. The shortlist
 * needs screening (P1-4); the summary card is part of the task-list fidelity
 * work deferred to P1 polish.
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
 * `GET /api/purchase-tasks/:taskId`, and the response to create / update
 * (P1-3). `criteria` is whatever was saved: a draft may be partial, so it
 * parses as `draftCriteriaSchema` (full criteria are a subset of it). Whether
 * it is runnable is `criteriaSchema.safeParse(criteria).success`.
 */
export const purchaseTaskDetailSchema = purchaseTaskSummarySchema.extend({
  criteria: draftCriteriaSchema,
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
