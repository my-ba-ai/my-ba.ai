import { Injectable } from '@nestjs/common';
import { healthResponseSchema, type HealthResponse } from '@my-ba/shared';

@Injectable()
export class HealthService {
  private readonly startedAt = Date.now();

  check(): HealthResponse {
    // Parsed rather than cast: Zod at all boundaries, including outbound ones.
    return healthResponseSchema.parse({
      status: 'ok',
      service: 'api',
      version: process.env['npm_package_version'] ?? '0.0.0',
      uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000),
      timestamp: new Date().toISOString(),
    });
  }
}
