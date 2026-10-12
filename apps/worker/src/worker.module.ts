import { Module } from "@nestjs/common"
import { ConfigModule } from "@nestjs/config"
import { DiagnosticsModule } from "./diagnostics/diagnostics.module"
import { ScreeningModule } from "./screening/screening.module"

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: [".env.local", ".env"],
    }),
    DiagnosticsModule,
    ScreeningModule,
  ],
})
export class WorkerModule {}
