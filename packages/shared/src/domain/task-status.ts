import { z } from 'zod';

/**
 * Purchase Task state machine (docs/03-domain-model.md).
 * Order matters: the pipeline only ever moves forward through this list.
 */
export const TASK_STATUS_ORDER = [
  'DRAFT',
  'SCREENING',
  'TREND_ANALYSIS',
  'GROWTH_ANALYSIS',
  'PROPERTY_SCOUTING',
  'AGENT_DISCOVERY',
  'CONTACT_AGENT',
  'IN_PROGRESS',
  'CLOSED',
] as const;

export const taskStatusSchema = z.enum(TASK_STATUS_ORDER);
export type TaskStatus = z.infer<typeof taskStatusSchema>;

/**
 * The stage at which the task's data is snapshotted and frozen (D04).
 * Nothing at or beyond this point may be rewritten.
 */
export const LOCKING_STATUS: TaskStatus = 'CONTACT_AGENT';

const statusIndex = new Map<TaskStatus, number>(
  TASK_STATUS_ORDER.map((status, index) => [status, index]),
);

function indexOfStatus(status: TaskStatus): number {
  const index = statusIndex.get(status);
  /* c8 ignore next 3 -- unreachable while TaskStatus is exhaustive */
  if (index === undefined) {
    throw new Error(`Unknown task status: ${status}`);
  }
  return index;
}

/** The stage that follows `status`, or null if the task is finished. */
export function nextStatus(status: TaskStatus): TaskStatus | null {
  return TASK_STATUS_ORDER[indexOfStatus(status) + 1] ?? null;
}

/** Only forward, single-step transitions are legal. */
export function canTransition(from: TaskStatus, to: TaskStatus): boolean {
  return nextStatus(from) === to;
}

/** True once the task has reached the point where its artifacts are immutable. */
export function isLocked(status: TaskStatus): boolean {
  return indexOfStatus(status) >= indexOfStatus(LOCKING_STATUS);
}
