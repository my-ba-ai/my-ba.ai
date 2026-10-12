import { Command } from "@langchain/langgraph"
import { createPool } from "@my-ba/db"
import type { Pool } from "pg"
import { createCheckpointer } from "./checkpointer"
import { parseOrchestratorEnv } from "./env"
import type { ScreeningConfig } from "./screening/config"
import { buildScreeningGraph, type ScreeningNode } from "./screening/graph"
import type { ScreeningPorts } from "./screening/ports"
import type { ScreenLogger } from "./screening/screen"
import { buildSpikeGraph, type SpikeNode } from "./spike/spike-graph"
import {
  decisionFitsGate,
  GateDecision,
  StageRef,
  threadIdFor,
  type Orchestrator,
  type StageName,
  type StageResult,
} from "./stage"
import { deriveStageResult, type SnapshotLike } from "./thread-status"

/** What `runScreening` needs, supplied by the worker (P1-4). */
export interface ScreeningStageDeps {
  ports: ScreeningPorts
  config: ScreeningConfig
  logger?: ScreenLogger
  onNodeRun?: (node: ScreeningNode) => void
}

export interface LangGraphOrchestratorOptions {
  pool: Pool
  /** Owned pools are ended by `close()`; injected ones are not. */
  ownsPool?: boolean
  onNodeRun?: (node: SpikeNode) => void
  /** Without it, the `screening` stage refuses to run. */
  screening?: ScreeningStageDeps
}

type GraphConfig = { configurable: { thread_id: string } }

/** The two calls the orchestrator makes on a compiled graph, without its generics. */
interface StageGraph {
  invoke(input: unknown, config: GraphConfig): Promise<unknown>
  getState(config: GraphConfig): Promise<SnapshotLike>
  /** The initial state for a fresh thread. */
  initialInput(ref: StageRef): Record<string, unknown>
}

export class LangGraphOrchestrator implements Orchestrator {
  private readonly pool: Pool
  private readonly ownsPool: boolean
  private readonly graphs: Partial<Record<StageName, StageGraph>>

  constructor(options: LangGraphOrchestratorOptions) {
    this.pool = options.pool
    this.ownsPool = options.ownsPool ?? false
    const checkpointer = createCheckpointer(options.pool)

    const spike = buildSpikeGraph({ checkpointer, onNodeRun: options.onNodeRun })
    this.graphs = {
      spike: {
        invoke: (input, config) => spike.invoke(input as never, config),
        getState: (config) => spike.getState(config),
        initialInput: (ref) => ({ taskId: ref.taskId }),
      },
    }

    if (options.screening) {
      const screening = buildScreeningGraph({ checkpointer, ...options.screening })
      this.graphs.screening = {
        invoke: (input, config) => screening.invoke(input as never, config),
        getState: (config) => screening.getState(config),
        initialInput: (ref) => ({ tenantId: ref.tenantId, taskId: ref.taskId, attempt: 1 }),
      }
    }
  }

  /** Builds its own dedicated checkpointer pool from env. */
  static fromEnv(
    env: NodeJS.ProcessEnv = process.env,
    options: Omit<LangGraphOrchestratorOptions, "pool" | "ownsPool"> = {},
  ): LangGraphOrchestrator {
    const parsed = parseOrchestratorEnv(env)
    const pool = createPool({
      connectionString: parsed.DATABASE_URL,
      max: parsed.CHECKPOINTER_POOL_MAX,
      applicationName: "my-ba-checkpointer",
    })
    return new LangGraphOrchestrator({ ...options, pool, ownsPool: true })
  }

  async getStageResult(ref: StageRef): Promise<StageResult> {
    const parsed = StageRef.parse(ref)
    const snapshot = await this.graphFor(parsed.stage).getState(this.configFor(parsed))
    return deriveStageResult(snapshot)
  }

  async runStage(ref: StageRef): Promise<StageResult> {
    const parsed = StageRef.parse(ref)
    const graph = this.graphFor(parsed.stage)
    const current = await this.getStageResult(parsed)

    switch (current.status) {
      case "not_started":
        return this.invokeAndRead(parsed, graph.initialInput(parsed))
      case "incomplete":
      case "failed":
        // `null` input = continue from the latest checkpoint. For a failed
        // thread that re-runs the node that threw (P1-4 AC 5: retry once the
        // quota resets or the balance is topped up).
        return this.invokeAndRead(parsed, null)
      default:
        return current
    }
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
    if (!decisionFitsGate(current.gate, answer)) {
      throw new InvalidGateDecisionError(parsed, current.gate.kind)
    }
    return this.invokeAndRead(parsed, new Command({ resume: answer }))
  }

  async close(): Promise<void> {
    if (this.ownsPool) await this.pool.end()
  }

  /**
   * A node that throws makes `invoke` reject, but the checkpoint records the
   * failure. Report that as a `failed` result rather than an exception, so a
   * caller sees the typed reason; rethrow anything the checkpoint did not
   * capture (a dead pool, a bug in the orchestrator itself).
   */
  private async invokeAndRead(ref: StageRef, input: unknown): Promise<StageResult> {
    try {
      await this.graphFor(ref.stage).invoke(input, this.configFor(ref))
    } catch (error) {
      const result = await this.getStageResult(ref)
      if (result.status === "failed") return result
      throw error
    }
    return this.getStageResult(ref)
  }

  private graphFor(stage: StageName): StageGraph {
    const graph = this.graphs[stage]
    if (!graph) {
      throw new Error(`stage ${stage} is not configured on this orchestrator`)
    }
    return graph
  }

  private configFor(ref: StageRef): GraphConfig {
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

/** The decision is not one this gate can act on (see `decisionFitsGate`). */
export class InvalidGateDecisionError extends Error {
  constructor(
    readonly ref: StageRef,
    readonly gate: string,
  ) {
    super(`decision does not fit the ${gate} gate of task ${ref.taskId}`)
    this.name = "InvalidGateDecisionError"
  }
}
