import { Command } from "@langchain/langgraph"
import { createPool } from "@my-ba/db"
import type { Pool } from "pg"
import { createCheckpointer } from "./checkpointer"
import { parseOrchestratorEnv } from "./env"
import { buildSpikeGraph, type SpikeGraph, type SpikeNode } from "./spike/spike-graph"
import { GateDecision, StageRef, threadIdFor, type Orchestrator, type StageResult } from "./stage"
import { deriveStageResult } from "./thread-status"

export interface LangGraphOrchestratorOptions {
  pool: Pool
  /** Owned pools are ended by `close()`; injected ones are not. */
  ownsPool?: boolean
  onNodeRun?: (node: SpikeNode) => void
}

export class LangGraphOrchestrator implements Orchestrator {
  private readonly pool: Pool
  private readonly ownsPool: boolean
  private readonly graph: SpikeGraph

  constructor(options: LangGraphOrchestratorOptions) {
    this.pool = options.pool
    this.ownsPool = options.ownsPool ?? false
    this.graph = buildSpikeGraph({
      checkpointer: createCheckpointer(options.pool),
      onNodeRun: options.onNodeRun,
    })
  }

  /** Builds its own dedicated checkpointer pool from env. */
  static fromEnv(
    env: NodeJS.ProcessEnv = process.env,
    onNodeRun?: (node: SpikeNode) => void,
  ): LangGraphOrchestrator {
    const parsed = parseOrchestratorEnv(env)
    const pool = createPool({
      connectionString: parsed.DATABASE_URL,
      max: parsed.CHECKPOINTER_POOL_MAX,
      applicationName: "my-ba-checkpointer",
    })
    return new LangGraphOrchestrator({ pool, ownsPool: true, onNodeRun })
  }

  async getStageResult(ref: StageRef): Promise<StageResult> {
    const snapshot = await this.graph.getState(this.configFor(ref))
    return deriveStageResult(snapshot)
  }

  async runStage(ref: StageRef): Promise<StageResult> {
    const parsed = StageRef.parse(ref)
    const current = await this.getStageResult(parsed)

    switch (current.status) {
      case "not_started":
        await this.graph.invoke({ taskId: parsed.taskId }, this.configFor(parsed))
        break
      case "incomplete":
        // `null` input = continue from the latest checkpoint.
        await this.graph.invoke(null, this.configFor(parsed))
        break
      default:
        return current
    }
    return this.getStageResult(parsed)
  }

  async resumeStage(ref: StageRef, decision: GateDecision): Promise<StageResult> {
    const parsed = StageRef.parse(ref)
    const answer = GateDecision.parse(decision)
    const current = await this.getStageResult(parsed)
    if (current.status !== "awaiting_approval") {
      // Without this, Command({ resume }) on a finished thread is a silent
      // no-op and a double-click on "approve" looks like it worked.
      throw new StageNotAwaitingApprovalError(parsed, current.status)
    }
    await this.graph.invoke(new Command({ resume: answer }), this.configFor(parsed))
    return this.getStageResult(parsed)
  }

  async close(): Promise<void> {
    if (this.ownsPool) await this.pool.end()
  }

  private configFor(ref: StageRef) {
    return { configurable: { thread_id: threadIdFor(ref) } }
  }
}

export class StageNotAwaitingApprovalError extends Error {
  constructor(
    readonly ref: StageRef,
    readonly actual: StageResult["status"],
  ) {
    super(`stage ${ref.stage} of task ${ref.taskId} is ${actual}, not awaiting_approval`)
    this.name = "StageNotAwaitingApprovalError"
  }
}
