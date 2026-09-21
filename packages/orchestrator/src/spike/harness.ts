import { loadEnvFiles } from "@my-ba/db"
import { appendFileSync } from "node:fs"
import path from "node:path"
import { LangGraphOrchestrator } from "../langgraph-orchestrator"
import { StageRef, type GateDecision } from "../stage"

/**
 * Child-process entry for the durability test. One process per step, so
 * nothing survives between steps except what is in Postgres.
 *
 *   tsx harness.ts start  <tenantId> <taskId>          -> prints result, then idles until killed
 *   tsx harness.ts status <tenantId> <taskId>          -> prints result, exits
 *   tsx harness.ts resume <tenantId> <taskId> <json>   -> prints result, exits
 *
 * SPIKE_PROBE_FILE: every node execution is appended to it as "<pid> <node>".
 * Output protocol: exactly one line prefixed RESULT on stdout.
 */

loadEnvFiles(path.resolve(__dirname, "../.."))

const [mode, tenantId, taskId, decisionJson] = process.argv.slice(2)
const probeFile = process.env.SPIKE_PROBE_FILE

function emit(value: unknown): void {
  process.stdout.write(`RESULT ${JSON.stringify(value)}\n`)
}

async function main(): Promise<void> {
  const ref = StageRef.parse({ tenantId, taskId, stage: "spike" })
  const orchestrator = LangGraphOrchestrator.fromEnv(process.env, (node) => {
    if (probeFile) appendFileSync(probeFile, `${process.pid} ${node}\n`)
  })

  switch (mode) {
    case "start": {
      emit(await orchestrator.runStage(ref))
      // Stay alive with the pool open, so the parent kills a process that is
      // paused and holding connections — not one that already exited cleanly.
      setInterval(() => undefined, 60_000)
      return
    }
    case "status":
      emit(await orchestrator.getStageResult(ref))
      break
    case "resume":
      // Unvalidated on purpose: resumeStage is the boundary under test.
      emit(await orchestrator.resumeStage(ref, JSON.parse(decisionJson ?? "null") as GateDecision))
      break
    default:
      throw new Error(`unknown mode ${String(mode)}`)
  }
  await orchestrator.close()
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
  // Exit only once the line is flushed; stdout to a pipe is not guaranteed sync.
  process.stdout.write(`RESULT ${JSON.stringify({ harnessError: message })}\n`, () =>
    process.exit(1),
  )
})
