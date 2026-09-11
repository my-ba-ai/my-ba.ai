import { z } from "zod"

/** The LangGraph nodes that can run inside a Purchase Task pipeline. */
export const AGENT_TYPES = [
  "SUBURB_SCREENER",
  "TREND_ANALYSER",
  "GROWTH_ANALYSER",
  "PROPERTY_SCOUT",
  "AGENT_DISCOVERY",
  "OUTREACH_COORDINATOR",
] as const

export const agentTypeSchema = z.enum(AGENT_TYPES)
export type AgentType = z.infer<typeof agentTypeSchema>

/** Autonomy level resolved by the policy engine (D29, D30). */
export const autonomyLevelSchema = z.enum(["AUTO", "HITL"])
export type AutonomyLevel = z.infer<typeof autonomyLevelSchema>

/** MVP ships every stage behind a human gate (D30). */
export const DEFAULT_AUTONOMY_LEVEL: AutonomyLevel = "HITL"
