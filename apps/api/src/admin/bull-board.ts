import { createBullBoard } from "@bull-board/api"
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter"
import { ExpressAdapter } from "@bull-board/express"
import { API_PREFIX, QUEUE_NAMES } from "@my-ba/shared"
import { getQueueToken } from "@nestjs/bullmq"
import { type INestApplication, Logger } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import type { Queue } from "bullmq"
import { basicAuth, type BasicAuthCredentials } from "./basic-auth"

export const BULL_BOARD_PATH = `/${API_PREFIX}/admin/queues`

const MIN_PASSWORD_LENGTH = 12

/** Queues shown in the board. Keep in step with `QueueModule`'s registrations. */
const BOARD_QUEUES = [QUEUE_NAMES.DIAGNOSTICS] as const

export type BullBoardDecision =
  | { mount: true; credentials: BasicAuthCredentials }
  | { mount: false; reason: string }

/**
 * Pure, so the rules are testable without an app:
 * - never in production (a dev tool until it is gated on a Clerk admin role),
 * - never without both credentials,
 * - half-configured or a short password is a boot failure, not a silent skip —
 *   someone who set one of the two clearly meant to turn it on.
 */
export function decideBullBoard(env: {
  nodeEnv: string | undefined
  user: string | undefined
  password: string | undefined
}): BullBoardDecision {
  const user = env.user?.trim() ?? ""
  const password = env.password ?? ""

  if (env.nodeEnv === "production") {
    return { mount: false, reason: "NODE_ENV=production" }
  }
  if (!user && !password) {
    return { mount: false, reason: "BULL_BOARD_USER / BULL_BOARD_PASSWORD not set" }
  }
  if (!user || !password) {
    throw new Error("Set both BULL_BOARD_USER and BULL_BOARD_PASSWORD, or neither.")
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`BULL_BOARD_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters.`)
  }
  return { mount: true, credentials: { user, password } }
}

/**
 * Mounts Bull Board on the underlying Express app, behind basic auth. Call
 * before `app.listen()`.
 */
export function mountBullBoard(app: INestApplication): boolean {
  const logger = new Logger("BullBoard")
  const config = app.get(ConfigService)

  const decision = decideBullBoard({
    nodeEnv: config.get<string>("NODE_ENV"),
    user: config.get<string>("BULL_BOARD_USER"),
    password: config.get<string>("BULL_BOARD_PASSWORD"),
  })

  if (!decision.mount) {
    logger.log(`Not mounted: ${decision.reason}`)
    return false
  }

  const serverAdapter = new ExpressAdapter()
  serverAdapter.setBasePath(BULL_BOARD_PATH)

  createBullBoard({
    queues: BOARD_QUEUES.map(
      (name) => new BullMQAdapter(app.get<Queue>(getQueueToken(name), { strict: false })),
    ),
    serverAdapter,
  })

  app.use(
    BULL_BOARD_PATH,
    basicAuth(decision.credentials, "my-ba queues"),
    serverAdapter.getRouter(),
  )
  logger.log(`Mounted at ${BULL_BOARD_PATH} (basic auth)`)
  return true
}
