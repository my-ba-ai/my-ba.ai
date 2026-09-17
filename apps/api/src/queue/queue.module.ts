import { BullModule } from "@nestjs/bullmq"
import { Module } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { parseRedisUrl, QUEUE_NAMES, QUEUE_PREFIX } from "@my-ba/shared"
import { redisUrlFrom } from "../redis/redis.module"

/**
 * The API is a producer only. It registers the queues it enqueues to (and that
 * Bull Board displays); processors live in apps/worker.
 *
 * Register a queue here in the same ticket that adds its processor, not before.
 */
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          ...parseRedisUrl(redisUrlFrom(config)),
          connectionName: "my-ba-api-queue",
          // Producer on the request path: if Redis is down, `add()` should
          // reject promptly and surface as a 5xx, not hold the request open.
          enableOfflineQueue: false,
        },
        prefix: QUEUE_PREFIX,
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: "exponential", delay: 5_000 },
          // Bounded history: enough to debug in Bull Board, not an audit log.
          // Anything that must be kept goes in Postgres (e.g. htag_calls).
          removeOnComplete: { count: 1_000, age: 7 * 24 * 60 * 60 },
          removeOnFail: { count: 5_000, age: 30 * 24 * 60 * 60 },
        },
      }),
    }),
    BullModule.registerQueue({ name: QUEUE_NAMES.DIAGNOSTICS }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
