import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { HeartbeatService } from './heartbeat.service';

describe('HeartbeatService', () => {
  let service: HeartbeatService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [HeartbeatService],
    }).compile();

    service = moduleRef.get(HeartbeatService);
  });

  it('boots without throwing', () => {
    expect(() => service.onApplicationBootstrap()).not.toThrow();
  });
});
