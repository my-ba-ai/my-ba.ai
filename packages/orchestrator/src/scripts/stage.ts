import { createDatabase, createPool, loadEnvFiles } from "@my-ba/db"
import { htagClientConfigFromEnv } from "@my-ba/htag-client"
import path from "node:path"
import { LangGraphOrchestrator } from "../langgraph-orchestrator"
import { screeningConfigFromEnv } from "../screening/config"
import { createPostgresScreeningPorts } from "../screening/postgres-ports"
import { StageName, StageRef, type StageResult } from "../stage"

/**
 * Dev-only stage CLI: reads where a stage's LangGraph thread is, straight
 * from the checkpoint. Read-only since P1-6 (D75): runs and resumes go
 * through the API (`POST /api/purchase-tasks/:taskId/run | approve | reject`)
 * and the worker, which keep `purchase_tasks.status` and the gate mirror on
 * `analysis_steps` in step with the graph. Driving the graph from here would
 * skip that sync and leave the task's status and the graph disagreeing.
 *
 *   pnpm --filter @my-ba/orchestrator stage status <tenantId> <taskId>
 *
 * Reads apps/worker/.env (DATABASE_URL, HTAG_API_KEY, SCREEN_*): building the
 * screening graph needs its ports even to read state. No HtAG call is made.
 * Find the tenant with:
 *   select tenant_id from purchase_tasks where id = '<taskId>';   -- as postgres
 * Refused when NODE_ENV=production.
 */

const USAGE = "usage: stage status <tenantId> <taskId> [--stage screening]"

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
  const [command, tenantId, taskId] = args
  if (command !== "status" || !tenantId || !taskId) throw new Error(USAGE)
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
    const result = await orchestrator.getStageResult(ref)
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
