import "reflect-metadata"
import { Logger } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { NestFactory } from "@nestjs/core"
import { API_PREFIX } from "@my-ba/shared"
import { AppModule } from "./app.module"

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true })
  const config = app.get(ConfigService)

  app.setGlobalPrefix(API_PREFIX)
  app.enableShutdownHooks()
  app.enableCors({
    origin: config.get<string>("WEB_ORIGIN", "http://localhost:3000"),
    credentials: true,
  })

  const port = config.get<number>("PORT", 3001)
  await app.listen(port)

  Logger.log(
    `API listening on http://localhost:${port}/${API_PREFIX}`,
    "Bootstrap",
  )
}

void bootstrap()
