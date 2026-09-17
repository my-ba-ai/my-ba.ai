import { Module } from "@nestjs/common"
import { ConfigModule } from "@nestjs/config"
import { DiagnosticsModule } from "./diagnostics/diagnostics.module"

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: [".env.local", ".env"],
    }),
    DiagnosticsModule,
  ],
})
export class WorkerModule {}
