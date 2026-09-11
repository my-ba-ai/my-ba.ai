import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HeartbeatService } from './heartbeat/heartbeat.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: ['.env.local', '.env'],
    }),
  ],
  providers: [HeartbeatService],
})
export class WorkerModule {}
