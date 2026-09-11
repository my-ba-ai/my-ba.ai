import { Test } from '@nestjs/testing';
import { healthResponseSchema } from '@my-ba/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [HealthService],
    }).compile();

    controller = moduleRef.get(HealthController);
  });

  it('returns a payload matching the shared health schema', () => {
    const result = controller.check();
    expect(healthResponseSchema.safeParse(result).success).toBe(true);
    expect(result.service).toBe('api');
  });
});
