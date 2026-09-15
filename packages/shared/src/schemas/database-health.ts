import { z } from "zod"

export const databaseHealthResponseSchema = z.object({
  status: z.enum(["ok", "unreachable"]),
  /** Round-trip time of a trivial query, in milliseconds. */
  latencyMs: z.number().nonnegative(),
  /** Extensions the schema depends on, with the version Postgres reports. */
  extensions: z.object({
    timescaledb: z.string().nullable(),
    vector: z.string().nullable(),
  }),
  /**
   * False when the API is connected as a role that bypasses row-level
   * security — a superuser, or one with BYPASSRLS. Every tenant policy is
   * inert in that state, so it is worth surfacing rather than assuming.
   */
  rlsEnforced: z.boolean(),
  timestamp: z.iso.datetime(),
})

export type DatabaseHealthResponse = z.infer<typeof databaseHealthResponseSchema>
