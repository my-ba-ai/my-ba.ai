import { createDatabase, createPool, loadEnvFiles } from "@my-ba/db"
import { htagClientConfigFromEnv } from "@my-ba/htag-client"
import path from "node:path"
import { LangGraphOrchestrator } from "../langgraph-orchestrator"
import { screeningConfigFromEnv } from "../screening/config"
import { createPostgresScreeningPorts } from "../screening/postgres-ports"
import { GateDecision, StageName, StageRef, type StageResult } from "../stage"

/**
 * Dev-only stage CLI (P1-4). Drives a stage the way the worker does, from a
 * terminal, until P1-6 adds the resume endpoint. It runs in this process, not
 * through BullMQ, and it spends HtAG money exactly as a worker run would.
 *
 *   pnpm --filter @my-ba/orchestrator stage status <tenantId> <taskId>
 *   pnpm --filter @my-ba/orchestrator stage run    <tenantId> <taskId>
 *   pnpm --filter @my-ba/orchestrator stage resume <tenantId> <taskId> '<decision json>'
 *
 * Decisions (validated against the paused gate before anything runs):
 *   '{"approved":false}'                     too-broad: criteria adjusted, screen again
 *   '{"approved":true}'                      approval: keep every ranked suburb
 *   '{"approved":true,"keep":["QLD123"]}'    approval: keep a subset
 *   '{"approved":false}'                     approval: Reject & Adjust, screen again
 *
 * Reads apps/worker/.env (DATABASE_URL, HTAG_API_KEY, SCREEN_*), so it behaves
 * like the worker. Find the tenant with:
 *   select tenant_id from purchase_tasks where id = '<taskId>';   -- as postgres
 * Refused when NODE_ENV=production.
 */

const USAGE =
  "usage: stage <status|run|resume> <tenantId> <taskId> ['<decision json>'] [--stage screening]"

function summarise(result: StageResult): Record<string, unknown> {
  if (result.status !== "awaiting_approval") return result
  const gate = result.gate
  if (gate.kind === "SCREENING_APPROVAL") {
    return {
      status: result.status,
      gate: gate.kind,
      attempt: gate.attempt,
      analysisStepId: gate.analysisStepId,
      costAud: gate.costAud,
      ranked: gate.rankedSuburbs.length,
      renterCoverage: gate.renterCoverage,
      disabledFactors: gate.disabledFactors,
      droppedAreaIds: gate.droppedAreaIds,
      top: gate.rankedSuburbs.slice(0, 10).map((s) => ({
        rank: s.rank,
        areaId: s.areaId,
        name: s.name,
        score: s.score === null ? null : Number(s.score.toFixed(3)),
        insufficientData: s.insufficientData,
      })),
    }
  }
  if (gate.kind === "SCREENING_TOO_BROAD") {
    return {
      status: result.status,
      gate: gate.kind,
      attempt: gate.attempt,
      analysisStepId: gate.analysisStepId,
      costAud: gate.costAud,
      returned: gate.returned,
      limit: gate.limit,
    }
  }
  return result
}

const log = (level: string) => (message: string, context?: Record<string, unknown>) =>
  console.log(`[${level}] ${message}`, context ? JSON.stringify(context) : "")

async function main(): Promise<void> {
  loadEnvFiles(path.resolve(__dirname, "../../../../apps/worker"))
  if (process.env.NODE_ENV === "production") {
    throw new Error("The stage CLI is dev-only; NODE_ENV=production.")
  }

  const args = process.argv.slice(2)
  const stageFlag = args.indexOf("--stage")
  const stage = StageName.parse(stageFlag >= 0 ? args.splice(stageFlag, 2)[1] : "screening")
  const [command, tenantId, taskId, decisionJson] = args
  if (!command || !tenantId || !taskId) throw new Error(USAGE)
  const ref = StageRef.parse({ tenantId, taskId, stage })

  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error("DATABASE_URL is not set in apps/worker/.env.")
  const pool = createPool({ connectionString, max: 3, applicationName: "my-ba-stage-cli" })
  const orchestrator = LangGraphOrchestrator.fromEnv(process.env, {
    screening: {
      ports: createPostgresScreeningPorts({
        db: createDatabase(pool),
        htag: htagClientConfigFromEnv(process.env),
        htagLogger: { warn: log("htag warn"), error: log("htag error") },
      }),
      config: screeningConfigFromEnv(process.env),
      logger: { info: log("info"), warn: log("warn") },
    },
  })

  try {
    let result: StageResult
    switch (command) {
      case "status":
        result = await orchestrator.getStageResult(ref)
        break
      case "run":
        result = await orchestrator.runStage(ref)
        break
      case "resume": {
        if (!decisionJson) throw new Error(`resume needs a decision.\n${USAGE}`)
        const decision = GateDecision.parse(JSON.parse(decisionJson))
        result = await orchestrator.resumeStage(ref, decision)
        break
      }
      default:
        throw new Error(USAGE)
    }
    console.log(JSON.stringify(summarise(result), null, 2))
  } finally {
    await orchestrator.close()
    await pool.end()
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
