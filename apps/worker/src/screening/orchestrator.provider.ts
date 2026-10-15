import { Logger, type Provider } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { createDatabase, createPool, type DatabasePool } from "@my-ba/db"
import { htagClientConfigFromEnv } from "@my-ba/htag-client"
import {
  createPostgresScreeningPorts,
  createPostgresStageSync,
  LangGraphOrchestrator,
  screeningConfigFromEnv,
  type Orchestrator,
  type StageSync,
} from "@my-ba/orchestrator"
import { ORCHESTRATOR, SCREENING_POOL, STAGE_SYNC } from "./screening.tokens"

const withContext = (message: string, context?: Record<string, unknown>) =>
  context ? `${message} ${JSON.stringify(context)}` : message

/**
 * The screener's queries and HtAG ledger writes run on this pool, as
 * `my_ba_app`. The orchestrator builds a second, dedicated pool for
 * checkpoints (docs/02: paused graphs must not starve the work).
 */
export const screeningPoolProvider: Provider = {
  provide: SCREENING_POOL,
  inject: [ConfigService],
  useFactory: (config: ConfigService): DatabasePool => {
    const connectionString = config.get<string>("DATABASE_URL")
    if (!connectionString) {
      throw new Error("DATABASE_URL is not set. See apps/worker/.env.example.")
    }
    return createPool({
      connectionString,
      max: Number(config.get<string>("DATABASE_POOL_MAX") ?? 5),
      applicationName: "my-ba-worker",
    })
  },
}

/**
 * Fails at boot, not at the first job, when `HTAG_API_KEY` is missing or a
 * `SCREEN_*` setting is invalid (P1-4).
 */
export const orchestratorProvider: Provider = {
  provide: ORCHESTRATOR,
  inject: [SCREENING_POOL],
  useFactory: (pool: DatabasePool): Orchestrator => {
    const logger = new Logger("Screening")
    const ports = createPostgresScreeningPorts({
      db: createDatabase(pool),
      htag: htagClientConfigFromEnv(process.env),
      htagLogger: {
        warn: (message, context) => logger.warn(withContext(message, context)),
        error: (message, context) => logger.error(withContext(message, context)),
      },
    })
    return LangGraphOrchestrator.fromEnv(process.env, {
      screening: {
        ports,
        config: screeningConfigFromEnv(process.env),
        logger: {
          info: (message, context) => logger.log(withContext(message, context)),
          warn: (message, context) => logger.warn(withContext(message, context)),
        },
      },
    })
  },
}

/** Status and gate sync (P1-6), on the screener's app-role pool. */
export const stageSyncProvider: Provider = {
  provide: STAGE_SYNC,
  inject: [SCREENING_POOL],
  useFactory: (pool: DatabasePool): StageSync => createPostgresStageSync(createDatabase(pool)),
}
