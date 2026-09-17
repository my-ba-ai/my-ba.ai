import { Inject, Injectable, Logger } from "@nestjs/common"
import type { Redis } from "ioredis"
import { redisHealthResponseSchema, type RedisHealthResponse } from "@my-ba/shared"
import { REDIS_CLIENT } from "../redis/redis.tokens"

/**
 * Readiness for Redis. Beyond "is it up", it reports the eviction policy,
 * because the failure worth catching is the silent one: a Redis that evicts
 * keys under memory pressure loses queued jobs without an error.
 */
@Injectable()
export class RedisHealthService {
  private readonly logger = new Logger(RedisHealthService.name)

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async check(): Promise<RedisHealthResponse> {
    const startedAt = Date.now()

    try {
      await this.redis.ping()
      const latencyMs = Date.now() - startedAt

      return redisHealthResponseSchema.parse({
        status: "ok",
        latencyMs,
        maxmemoryPolicy: await this.evictionPolicy(),
        timestamp: new Date().toISOString(),
      })
    } catch (error: unknown) {
      this.logger.error("Redis readiness check failed", error)
      return redisHealthResponseSchema.parse({
        status: "unreachable",
        latencyMs: Date.now() - startedAt,
        maxmemoryPolicy: null,
        timestamp: new Date().toISOString(),
      })
    }
  }

  /** Managed Redis often disables CONFIG; unknown is an answer, not a failure. */
  private async evictionPolicy(): Promise<string | null> {
    try {
      const reply = (await this.redis.config("GET", "maxmemory-policy")) as unknown
      if (Array.isArray(reply) && typeof reply[1] === "string") return reply[1]
      return null
    } catch {
      return null
    }
  }
}
