import { Command } from "@langchain/langgraph"
import { MemorySaver } from "@langchain/langgraph-checkpoint"
import { describe, expect, it } from "vitest"
import { areas, FakePorts, TASK_ID, TENANT_ID } from "../../test/screening-fakes"
import { threadIdFor } from "../stage"
import { deriveStageResult } from "../thread-status"
import { DEFAULT_SCREENING_CONFIG } from "./config"
import { buildScreeningGraph, type ScreeningNode } from "./graph"

function setup(queryLimit = 100) {
  const ports = new FakePorts()
  const runs: ScreeningNode[] = []
  const graph = buildScreeningGraph({
    checkpointer: new MemorySaver(),
    ports,
    config: { ...DEFAULT_SCREENING_CONFIG, queryLimit },
    onNodeRun: (node) => runs.push(node),
  })
  const config = {
    configurable: {
      thread_id: threadIdFor({ tenantId: TENANT_ID, taskId: TASK_ID, stage: "screening" }),
    },
  }
  const start = () => graph.invoke({ tenantId: TENANT_ID, taskId: TASK_ID, attempt: 1 }, config)
  const resume = (answer: unknown) => graph.invoke(new Command({ resume: answer }), config)
  const result = async () => deriveStageResult(await graph.getState(config))
  return { ports, runs, start, resume, result }
}

describe("screening graph (P1-4, D73)", () => {
  it("pauses at SCREENING_APPROVAL; approving does not re-run the billed node", async () => {
    const { ports, runs, start, resume, result } = setup()
    ports.htag.queryRows = areas(5)

    await start()
    const paused = await result()
    expect(paused.status).toBe("awaiting_approval")
    if (paused.status !== "awaiting_approval") return
    expect(paused.gate.kind).toBe("SCREENING_APPROVAL")
    const billed = ports.htag.ledger.length

    await resume({ approved: true, keep: ["NSW1001", "NSW1003"] })

    expect(await result()).toEqual({
      status: "completed",
      output: { approved: true, items: expect.arrayContaining(["NSW1001", "NSW1003"]) },
    })
    expect(ports.htag.ledger).toHaveLength(billed)
    expect(runs.filter((n) => n === "screen")).toHaveLength(1)
    expect(runs.filter((n) => n === "approval_gate")).toHaveLength(2)
  })

  it("too broad → resume loops back to screen as attempt 2 with the task's current criteria", async () => {
    const { ports, runs, start, resume, result } = setup(5)
    ports.htag.queryRows = areas(8)

    await start()
    const first = await result()
    expect(first.status === "awaiting_approval" && first.gate.kind).toBe("SCREENING_TOO_BROAD")

    // The user tightens criteria; the query now returns fewer than the limit.
    ports.htag.queryRows = areas(3)
    await resume({ approved: false, note: "narrowed price band" })

    const second = await result()
    expect(second.status).toBe("awaiting_approval")
    if (second.status !== "awaiting_approval") return
    expect(second.gate).toMatchObject({ kind: "SCREENING_APPROVAL", attempt: 2 })
    expect([...ports.steps.values()].map((s) => [s.attempt, s.outcome])).toEqual([
      [1, "too_broad"],
      [2, "ranked"],
    ])
    expect(runs.filter((n) => n === "screen")).toHaveLength(2)
  })

  it("Reject & Adjust at the approval gate also loops back to screen", async () => {
    const { ports, start, resume, result } = setup()
    ports.htag.queryRows = areas(3)
    await start()
    await resume({ approved: false })
    const again = await result()
    expect(again).toMatchObject({ status: "awaiting_approval", gate: { attempt: 2 } })
  })
})
