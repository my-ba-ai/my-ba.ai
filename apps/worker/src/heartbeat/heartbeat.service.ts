import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { QUEUE_NAMES } from '@my-ba/shared';

/**
 * Placeholder that proves the worker process boots and can see shared code.
 * Replaced by real BullMQ processors in P0-4.
 */
@Injectable()
export class HeartbeatService implements OnApplicationBootstrap {
  private readonly logger = new Logger(HeartbeatService.name);

  onApplicationBootstrap(): void {
    this.logger.log(`Queues awaiting wiring: ${Object.values(QUEUE_NAMES).join(', ')}`);
  }
}
