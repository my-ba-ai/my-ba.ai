import { Annotation, END, START, StateGraph, interrupt } from "@langchain/langgraph"
import type { BaseCheckpointSaver } from "@langchain/langgraph-checkpoint"
import { GateDecision, GatePayload, type StageOutput } from "../stage"

/**
 * P0-5: three nodes, one interrupt. Shaped like a real stage — do some work,
 * ask a human, act on the answer — so the spike proves the pattern Phase 1
 * will copy, not just that `interrupt()` returns.
 */

export const SPIKE_NODES = ["prepare", "approval_gate", "finalise"] as const
export type SpikeNode = (typeof SPIKE_NODES)[number]

const lastValue = <T>(initial: T) =>
  Annotation<T>({ reducer: (_previous, next) => next, default: () => initial })

export const SpikeState = Annotation.Root({
  taskId: lastValue<string>(""),
  shortlist: lastValue<string[]>([]),
  decision: lastValue<GateDecision | null>(null),
  output: lastValue<StageOutput | null>(null),
})
export type SpikeStateValues = typeof SpikeState.State

export interface SpikeGraphDeps {
  checkpointer: BaseCheckpointSaver
  /**
   * Called on every node *execution*. The integration test writes these to a
   * file to prove which nodes re-ran after a restart.
   */
  onNodeRun?: (node: SpikeNode) => void
}

/** Deterministic stand-in for the suburb screener. */
export function shortlistFor(taskId: string): string[] {
  const seed = taskId.slice(0, 4)
  return [`${seed}-newtown`, `${seed}-marrickville`, `${seed}-ashfield`]
}

export function buildSpikeGraph({ checkpointer, onNodeRun }: SpikeGraphDeps) {
  const probe = onNodeRun ?? (() => undefined)

  return new StateGraph(SpikeState)
    .addNode("prepare", (state) => {
      probe("prepare")
      return { shortlist: shortlistFor(state.taskId) }
    })
    .addNode("approval_gate", (state) => {
      // LangGraph re-executes this node from the top on resume. Anything above
      // `interrupt()` runs twice, so it must be idempotent or live in its own
      // node. The integration test asserts this node runs exactly twice.
      probe("approval_gate")
      const payload = GatePayload.parse({
        kind: "approval",
        stage: "spike",
        summary: `Approve ${state.shortlist.length} suburbs for task ${state.taskId}`,
        items: state.shortlist,
      })
      const answer: unknown = interrupt(payload)
      // The orchestrator already validated this; parse again because the
      // checkpoint is a boundary too (a resume written by another version).
      return { decision: GateDecision.parse(answer) }
    })
    .addNode("finalise", (state) => {
      probe("finalise")
      const decision = state.decision
      if (!decision) throw new Error("finalise reached without a decision")
      const items = decision.approved
        ? state.shortlist.filter((item) => decision.keep?.includes(item) ?? true)
        : []
      return { output: { approved: decision.approved, items } }
    })
    .addEdge(START, "prepare")
    .addEdge("prepare", "approval_gate")
    .addEdge("approval_gate", "finalise")
    .addEdge("finalise", END)
    .compile({ checkpointer })
}

export type SpikeGraph = ReturnType<typeof buildSpikeGraph>
