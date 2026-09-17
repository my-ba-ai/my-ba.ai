import { GatePayload, StageOutput, type StageResult } from "./stage"

/**
 * LangGraph.js has no "thread status" — that is a LangGraph Platform (server)
 * concept. The OSS library only gives a StateSnapshot, so status is derived
 * here. Structural type on purpose: keeps LangGraph types out of the contract
 * and makes this unit-testable without a graph.
 */
export interface SnapshotLike {
  values: unknown
  next: readonly string[]
  tasks: readonly {
    name: string
    error?: unknown
    interrupts: readonly { value?: unknown }[]
  }[]
  metadata?: unknown
  createdAt?: string
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message: unknown }).message)
  }
  return String(error)
}

export function deriveStageResult(snapshot: SnapshotLike): StageResult {
  // An empty thread: getState returns a snapshot with no checkpoint behind it.
  if (snapshot.createdAt === undefined && snapshot.metadata === undefined) {
    return { status: "not_started" }
  }

  const failed = snapshot.tasks.find((task) => task.error !== undefined && task.error !== null)
  if (failed) {
    return { status: "failed", error: `${failed.name}: ${errorMessage(failed.error)}` }
  }

  const pending = snapshot.tasks.flatMap((task) => task.interrupts)
  if (pending.length > 1) {
    // One gate per stage is a design rule, not a LangGraph limit. Fail loudly
    // rather than silently answering only the first.
    return { status: "failed", error: `expected one pending interrupt, found ${pending.length}` }
  }
  const [interrupt] = pending
  if (interrupt) {
    return { status: "awaiting_approval", gate: GatePayload.parse(interrupt.value) }
  }

  if (snapshot.next.length > 0) {
    return { status: "incomplete", next: [...snapshot.next] }
  }

  const values = snapshot.values as { output?: unknown } | undefined
  const output = StageOutput.safeParse(values?.output)
  if (!output.success) {
    return { status: "failed", error: "thread finished without a valid output" }
  }
  return { status: "completed", output: output.data }
}
