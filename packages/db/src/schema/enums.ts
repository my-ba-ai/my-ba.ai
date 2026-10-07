import { AGENT_TYPES, AU_STATES, TASK_STATUS_ORDER, USER_ROLES } from "@my-ba/shared"
import { pgEnum } from "drizzle-orm/pg-core"

/**
 * Enum values are owned by `@my-ba/shared`, not duplicated here. If the state
 * machine in docs/03-domain-model.md gains a stage, it changes in one place and
 * the migration that alters the Postgres type is written by hand.
 */
export const taskStatus = pgEnum("task_status", [...TASK_STATUS_ORDER])

export const agentType = pgEnum("agent_type", [...AGENT_TYPES])

/** docs/03-domain-model.md — Users.role. Values owned by `@my-ba/shared`, like the two above. */
export const userRole = pgEnum("user_role", [...USER_ROLES])

/** Australian states and territories. Values owned by `@my-ba/shared` (P1-3 criteria use them too). */
export { AU_STATES }
export const auState = pgEnum("au_state", AU_STATES)
