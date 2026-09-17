import { z } from "zod"

/** `GET /api/health/redis`. Always 200; the payload carries the verdict, like `/health/db`. */
export const redisHealthResponseSchema = z.object({
  status: z.enum(["ok", "unreachable"]),
  latencyMs: z.number().nonnegative(),
  /**
   * BullMQ needs `noeviction`. Under any other policy Redis may evict queue keys
   * under memory pressure, and jobs vanish without an error. Null when unknown
   * (unreachable, or a managed Redis that refuses CONFIG GET).
   */
  maxmemoryPolicy: z.string().nullable(),
  timestamp: z.iso.datetime(),
})

export type RedisHealthResponse = z.infer<typeof redisHealthResponseSchema>
