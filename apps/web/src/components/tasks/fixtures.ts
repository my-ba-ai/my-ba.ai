import type { PurchaseTaskSummary } from "@my-ba/shared"

/** Test fixtures for the populated task list. Real rows arrive with P1-3. */
export const DRAFT_TASK: PurchaseTaskSummary = {
  id: "aaaaaaaa-2222-4333-8444-555555555555",
  name: "Brisbane growth corridor",
  status: "DRAFT",
  lockedAt: null,
  clonedFromTaskId: null,
  createdAt: "2026-09-20T23:00:00.000Z",
  updatedAt: "2026-09-21T02:00:00.000Z",
}

export const SCREENING_TASK: PurchaseTaskSummary = {
  ...DRAFT_TASK,
  id: "bbbbbbbb-2222-4333-8444-555555555555",
  name: "Hunter Valley yield",
  status: "SCREENING",
}

export const LOCKED_TASK: PurchaseTaskSummary = {
  ...DRAFT_TASK,
  id: "cccccccc-2222-4333-8444-555555555555",
  name: "Geelong, locked",
  status: "CONTACT_AGENT",
  lockedAt: "2026-09-21T03:00:00.000Z",
}
