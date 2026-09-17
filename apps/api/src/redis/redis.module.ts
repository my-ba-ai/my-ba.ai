import {
  Global,
  Inject,
  Logger,
  Module,
  type OnApplicationShutdown,
  type Provider,
} from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { Redis } from "ioredis"
import { parseRedisUrl } from "@my-ba/shared"
import { REDIS_CLIENT } from "./redis.tokens"

export { REDIS_CLIENT } from "./redis.tokens"

/** Reads and validates `REDIS_URL`. Shared by this module and the queue module. */
export function redisUrlFrom(config: ConfigService): string {
  const url = config.get<string>("REDIS_URL")
  if (!url) {
    throw new Error("REDIS_URL is not set. See apps/api/.env.example.")
  }
  return url
}

const clientProvider: Provider = {
  provide: REDIS_CLIENT,
  inject: [ConfigService],
  useFactory: (config: ConfigService): Redis => {
    const logger = new Logger("RedisClient")
    const client = new Redis({
      ...parseRedisUrl(redisUrlFrom(config)),
      connectionName: "my-ba-api",
      // This client sits on the request path (identity cache). A command
      // against a Redis that is down must fail fast so the caller can fall
      // back to Postgres — not queue up and hang the request.
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      commandTimeout: 500,
    })
    // Without a listener ioredis logs every reconnect attempt as an unhandled
    // error event.
    client.on("error", (error: Error) => logger.warn(`Redis error: ${error.message}`))
    return client
  },
}

@Global()
@Module({
  providers: [clientProvider],
  exports: [REDIS_CLIENT],
})
export class RedisModule implements OnApplicationShutdown {
  private readonly logger = new Logger(RedisModule.name)

  constructor(@Inject(REDIS_CLIENT) private readonly client: Redis) {}

  async onApplicationShutdown(): Promise<void> {
    try {
      await this.client.quit()
    } catch {
      this.client.disconnect()
    }
    this.logger.log("Redis client closed")
  }
}
