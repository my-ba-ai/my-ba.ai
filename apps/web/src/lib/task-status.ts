import { TASK_STATUS_ORDER, type TaskStatus } from "@my-ba/shared"

/** Display labels for the state machine. Kept here, not in shared: they are copy, not contract. */
export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  DRAFT: "Draft",
  SCREENING: "Screening",
  TREND_ANALYSIS: "Trend analysis",
  GROWTH_ANALYSIS: "Growth analysis",
  PROPERTY_SCOUTING: "Property scouting",
  AGENT_DISCOVERY: "Agent discovery",
  CONTACT_AGENT: "Contact agent",
  IN_PROGRESS: "In progress",
  CLOSED: "Closed",
}

/**
 * Pill tone. Analysis stages are teal and pulse, because something is running
 * or waiting on a gate. Agent-facing stages use the indigo accent, which the
 * design system reserves for agent work.
 */
export type StatusTone = "neutral" | "active" | "agent"

export const TASK_STATUS_TONE: Record<TaskStatus, StatusTone> = {
  DRAFT: "neutral",
  SCREENING: "active",
  TREND_ANALYSIS: "active",
  GROWTH_ANALYSIS: "active",
  PROPERTY_SCOUTING: "active",
  AGENT_DISCOVERY: "agent",
  CONTACT_AGENT: "agent",
  IN_PROGRESS: "agent",
  CLOSED: "neutral",
}

/** Zero-based position in the pipeline, for the stepper. */
export function stageIndex(status: TaskStatus): number {
  return TASK_STATUS_ORDER.indexOf(status)
}
