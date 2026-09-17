import { z } from "zod"

const envSchema = z.object({
  /** my_ba_app. The checkpointer never runs as the schema owner. */
  DATABASE_URL: z.string().min(1),
  /** Schema owner. Only `checkpointer:setup` uses it. */
  DATABASE_MIGRATION_URL: z.string().min(1).optional(),
  /**
   * Separate from DATABASE_POOL_MAX: docs/02 lists checkpointer connection
   * exhaustion as a live risk, so paused graphs get their own small pool.
   */
  CHECKPOINTER_POOL_MAX: z.coerce.number().int().positive().default(5),
})

export type OrchestratorEnv = z.infer<typeof envSchema>

export function parseOrchestratorEnv(source: NodeJS.ProcessEnv = process.env): OrchestratorEnv {
  return envSchema.parse(source)
}
