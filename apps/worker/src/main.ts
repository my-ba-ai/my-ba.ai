import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker.module';

/**
 * The worker runs as a standalone Nest application context — no HTTP server.
 * It shares modules with apps/api but scales independently (see docs/02-architecture.md).
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(WorkerModule, {
    bufferLogs: true,
  });

  app.enableShutdownHooks();
  Logger.log('Worker context started; no queues registered yet (P0-4)', 'Bootstrap');
}

void bootstrap();
