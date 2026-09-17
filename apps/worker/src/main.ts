import "reflect-metadata"
import { Logger } from "@nestjs/common"
import { NestFactory } from "@nestjs/core"
import { QUEUE_NAMES } from "@my-ba/shared"
import { WorkerModule } from "./worker.module"

/**
 * The worker runs as a standalone Nest application context — no HTTP server.
 * It shares modules with apps/api but scales independently (see docs/02-architecture.md).
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(WorkerModule, {
    bufferLogs: true,
  })

  // Shutdown hooks let @nestjs/bullmq close workers gracefully on SIGTERM:
  // the active job finishes (or is returned to the queue) instead of stalling.
  app.enableShutdownHooks()
  Logger.log(`Worker context started; processing: ${QUEUE_NAMES.DIAGNOSTICS}`, "Bootstrap")
}

void bootstrap()
