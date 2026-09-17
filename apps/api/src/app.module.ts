import { Module } from "@nestjs/common"
import { ConfigModule } from "@nestjs/config"
import { AuthModule } from "./auth/auth.module"
import { DatabaseModule } from "./database/database.module"
import { DiagnosticsModule } from "./diagnostics/diagnostics.module"
import { HealthModule } from "./health/health.module"
import { QueueModule } from "./queue/queue.module"
import { RedisModule } from "./redis/redis.module"

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: [".env.local", ".env"],
    }),
    DatabaseModule,
    RedisModule,
    QueueModule,
    AuthModule,
    HealthModule,
    DiagnosticsModule,
  ],
})
export class AppModule {}
