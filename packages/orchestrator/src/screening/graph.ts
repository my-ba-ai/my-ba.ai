import { Annotation, END, START, StateGraph, interrupt } from "@langchain/langgraph"
import type { BaseCheckpointSaver } from "@langchain/langgraph-checkpoint"
import { GateDecision, GatePayload, type StageOutput } from "../stage"
import type { ScreeningConfig } from "./config"
import type { ScreeningPorts } from "./ports"
import { runScreening, type ScreenLogger, type ScreenResult } from "./screen"

/**
 * The screening stage (P1-4, D73):
 *
 *   START → screen ─┬─ too broad ─→ too_broad_gate ──────────────→ screen (attempt + 1)
 *                   └─ ranked ────→ approval_gate ─┬─ approved ──→ finalise → END
 *                                                  └─ rejected ──→ screen (attempt + 1)
 *
 * `screen` does every billed call (steps 1–8). The gates do nothing but
 * interrupt, because LangGraph re-executes the interrupting node from the top
 * on resume: if the HtAG calls lived above `interrupt()`, every approval would
 * pay for them again.
 *
 * Looping stays in one thread (decided 2026-10-09): a too-broad resume or a
 * Reject & Adjust re-enters `screen`, which re-reads the task's criteria, so
 * the user's edits take effect. Each pass is a new `attempt` with its own
 * `analysis_steps` row.
 */

export const SCREENING_NODES = ["screen", "too_broad_gate", "approval_gate", "finalise"] as const
export type ScreeningNode = (typeof SCREENING_NODES)[number]

const lastValue = <T>(initial: T) =>
  Annotation<T>({ reducer: (_previous, next) => next, default: () => initial })

export const ScreeningState = Annotation.Root({
  tenantId: lastValue<string>(""),
  taskId: lastValue<string>(""),
  attempt: lastValue<number>(1),
  /** The last `screen` pass. (A channel cannot share the node's name.) */
  result: lastValue<ScreenResult | null>(null),
  decision: lastValue<GateDecision | null>(null),
  output: lastValue<StageOutput | null>(null),
})
export type ScreeningStateValues = typeof ScreeningState.State

export interface ScreeningGraphDeps {
  checkpointer: BaseCheckpointSaver
  ports: ScreeningPorts
  config: ScreeningConfig
  logger?: ScreenLogger
  /** Called on every node execution; tests use it to prove what re-ran. */
  onNodeRun?: (node: ScreeningNode) => void
}

function gateAnswer(payload: GatePayload): GateDecision {
  const answer: unknown = interrupt(GatePayload.parse(payload))
  // Validated by the orchestrator already; parsed again because the
  // checkpoint is a boundary too (a resume written by another version).
  return GateDecision.parse(answer)
}

export function buildScreeningGraph(deps: ScreeningGraphDeps) {
  const probe = deps.onNodeRun ?? (() => undefined)

  return new StateGraph(ScreeningState)
    .addNode("screen", async (state) => {
      probe("screen")
      const result = await runScreening(
        deps.ports,
        {
          tenantId: state.tenantId,
          taskId: state.taskId,
          attempt: state.attempt,
          config: deps.config,
        },
        deps.logger,
      )
      return { result, decision: null }
    })
    .addNode("too_broad_gate", (state) => {
      probe("too_broad_gate")
      if (state.result?.kind !== "too_broad")
        throw new Error("too_broad_gate without a too-broad result")
      const decision = gateAnswer(state.result.gate)
      return { decision, attempt: state.attempt + 1 }
    })
    .addNode("approval_gate", (state) => {
      probe("approval_gate")
      if (state.result?.kind !== "ranked") throw new Error("approval_gate without a ranked result")
      const decision = gateAnswer(state.result.gate)
      return decision.approved ? { decision } : { decision, attempt: state.attempt + 1 }
    })
    .addNode("finalise", (state) => {
      probe("finalise")
      const decision = state.decision
      if (state.result?.kind !== "ranked" || !decision?.approved) {
        throw new Error("finalise reached without an approved ranking")
      }
      const ranked = state.result.gate.rankedSuburbs.map((s) => s.areaId)
      const items = decision.keep ? ranked.filter((id) => decision.keep?.includes(id)) : ranked
      return { output: { approved: true, items } }
    })
    .addEdge(START, "screen")
    .addConditionalEdges(
      "screen",
      (state) => (state.result?.kind === "too_broad" ? "too_broad_gate" : "approval_gate"),
      ["too_broad_gate", "approval_gate"],
    )
    .addEdge("too_broad_gate", "screen")
    .addConditionalEdges(
      "approval_gate",
      (state) => (state.decision?.approved ? "finalise" : "screen"),
      ["finalise", "screen"],
    )
    .addEdge("finalise", END)
    .compile({ checkpointer: deps.checkpointer })
}

export type ScreeningGraph = ReturnType<typeof buildScreeningGraph>
