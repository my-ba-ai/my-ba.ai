import {
  Global,
  Inject,
  Logger,
  Module,
  type OnApplicationShutdown,
  type Provider,
} from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { createDatabase, createPool, type Database, type DatabasePool } from "@my-ba/db"
import { DATABASE, DATABASE_POOL } from "./database.tokens"
import { TenantDatabaseService } from "./tenant-database.service"

export { DATABASE, DATABASE_POOL } from "./database.tokens"

const poolProvider: Provider = {
  provide: DATABASE_POOL,
  inject: [ConfigService],
  useFactory: (config: ConfigService): DatabasePool => {
    const connectionString = config.get<string>("DATABASE_URL")
    if (!connectionString) {
      throw new Error("DATABASE_URL is not set. See apps/api/.env.example.")
    }

    return createPool({
      connectionString,
      max: config.get<number>("DATABASE_POOL_MAX", 10),
      applicationName: "my-ba-api",
    })
  },
}

const databaseProvider: Provider = {
  provide: DATABASE,
  inject: [DATABASE_POOL],
  useFactory: (pool: DatabasePool): Database => createDatabase(pool),
}

/**
 * Global because everything below the controllers eventually reads or writes.
 *
 * Note this pool is the API's alone. The worker builds its own, and P0-5's
 * LangGraph checkpointer should build a third — docs/02 lists checkpointer
 * connection exhaustion as a live risk, and sharing one pool is how a queue of
 * paused graphs starves HTTP requests.
 */
@Global()
@Module({
  providers: [poolProvider, databaseProvider, TenantDatabaseService],
  exports: [DATABASE, DATABASE_POOL, TenantDatabaseService],
})
export class DatabaseModule implements OnApplicationShutdown {
  private readonly logger = new Logger(DatabaseModule.name)

  constructor(@Inject(DATABASE_POOL) private readonly pool: DatabasePool) {}

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end()
    this.logger.log("Database pool closed")
  }
}
