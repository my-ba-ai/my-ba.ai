import { AGENT_TYPES, TASK_STATUS_ORDER } from "@my-ba/shared"
import { pgEnum } from "drizzle-orm/pg-core"

/**
 * Enum values are owned by `@my-ba/shared`, not duplicated here. If the state
 * machine in docs/03-domain-model.md gains a stage, it changes in one place and
 * the migration that alters the Postgres type is written by hand.
 */
export const taskStatus = pgEnum("task_status", [...TASK_STATUS_ORDER])

export const agentType = pgEnum("agent_type", [...AGENT_TYPES])

/** docs/03-domain-model.md — Users.role */
export const USER_ROLES = ["investor", "agent", "admin"] as const
export const userRole = pgEnum("user_role", USER_ROLES)

/** Australian states and territories. Eight of them, and that will not change. */
export const AU_STATES = ["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"] as const
export const auState = pgEnum("au_state", AU_STATES)
