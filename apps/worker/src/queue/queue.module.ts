import { BullModule } from "@nestjs/bullmq"
import { Module } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { parseRedisUrl, QUEUE_NAMES, QUEUE_PREFIX } from "@my-ba/shared"

/**
 * Connection and queue registrations for the worker. Mirrors apps/api's
 * `QueueModule`; the two must agree on `QUEUE_PREFIX` and the Redis instance,
 * or processors listen to queues nobody writes to.
 */
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = config.get<string>("REDIS_URL")
        if (!url) {
          throw new Error("REDIS_URL is not set. See apps/worker/.env.example.")
        }
        return {
          connection: {
            ...parseRedisUrl(url),
            connectionName: "my-ba-worker",
            // Required by BullMQ for blocking worker connections: a worker
            // should wait out a Redis restart, not throw after N retries.
            maxRetriesPerRequest: null,
          },
          prefix: QUEUE_PREFIX,
        }
      },
    }),
    BullModule.registerQueue({ name: QUEUE_NAMES.DIAGNOSTICS }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
