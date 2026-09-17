import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres"
import type { Pool } from "pg"

/**
 * LangGraph's checkpoint tables live in their own schema, created by a Drizzle
 * custom migration and populated by `PostgresSaver.setup()` (D51). They are the
 * one carve-out from "tenant_id on every table": the library owns their shape,
 * so tenant scope lives in the thread id (see `threadIdFor`).
 */
export const CHECKPOINT_SCHEMA = "langgraph"

export function createCheckpointer(pool: Pool): PostgresSaver {
  return new PostgresSaver(pool, undefined, { schema: CHECKPOINT_SCHEMA })
}
