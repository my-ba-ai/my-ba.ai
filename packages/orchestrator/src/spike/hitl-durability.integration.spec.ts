import { loadEnvFiles } from "@my-ba/db"
import { spawn } from "node:child_process"
import { randomUUID } from "node:crypto"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { Pool } from "pg"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { CHECKPOINT_SCHEMA } from "../checkpointer"
import { parseOrchestratorEnv } from "../env"
import type { StageResult } from "../stage"

/**
 * P0-5 gate. Needs `pnpm db:up && pnpm db:migrate`.
 *
 * Every step runs in its own process, as my_ba_app, so the only thing carried
 * between steps is what PostgresSaver wrote. Acceptance criteria (docs/05):
 *   1. run pauses                         -> start returns awaiting_approval
 *   2. status is "interrupted"            -> a fresh process derives awaiting_approval
 *   3. process can restart while paused   -> SIGKILL while holding pool connections
 *   4. resume continues from checkpoint   -> `prepare` does NOT re-run after resume
 *   5. state survives                     -> output is built from the pre-kill shortlist
 */

const HARNESS = path.resolve(__dirname, "harness.ts")
const PACKAGE_ROOT = path.resolve(__dirname, "../..")

// Same env the harness children load. Parsed so a missing DATABASE_URL fails
// here with a Zod error instead of as a SCRAM "password must be a string".
loadEnvFiles(PACKAGE_ROOT)
const env = parseOrchestratorEnv()

type HarnessResult = StageResult | { harnessError: string }

interface Running {
  result: Promise<HarnessResult>
  kill: () => Promise<number | null>
}

function runHarness(args: string[], probeFile: string): Running {
  const child = spawn(process.execPath, ["--import", "tsx", HARNESS, ...args], {
    cwd: PACKAGE_ROOT,
    env: { ...process.env, SPIKE_PROBE_FILE: probeFile },
    stdio: ["ignore", "pipe", "pipe"],
  })

  let stdout = ""
  let stderr = ""
  child.stderr.on("data", (chunk: Buffer) => {
    stderr += chunk.toString()
  })

  const exited = new Promise<number | null>((resolve) => child.on("exit", (code) => resolve(code)))

  const result = new Promise<HarnessResult>((resolve, reject) => {
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString()
      const line = stdout.split("\n").find((l) => l.startsWith("RESULT "))
      if (line) resolve(JSON.parse(line.slice("RESULT ".length)) as HarnessResult)
    })
    void exited.then((code) => {
      if (!stdout.includes("RESULT ")) {
        reject(new Error(`harness exited ${code} without a result\n${stderr}`))
      }
    })
  })

  return {
    result,
    kill: async () => {
      child.kill("SIGKILL")
      return exited
    },
  }
}

function probeLines(file: string): { pid: string; node: string }[] {
  let text = ""
  try {
    text = readFileSync(file, "utf8")
  } catch {
    return []
  }
  return text
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [pid = "", node = ""] = line.split(" ")
      return { pid, node }
    })
}

const count = (lines: { node: string }[], node: string) =>
  lines.filter((line) => line.node === node).length

describe("P0-5: LangGraph.js durable interrupt", () => {
  let dir: string
  let admin: Pool

  beforeAll(async () => {
    dir = mkdtempSync(path.join(tmpdir(), "p0-5-"))
    // Read-only helper for asserting on checkpoint rows. Same role as the app.
    admin = new Pool({ connectionString: env.DATABASE_URL, max: 1 })
    const tables = await admin.query(
      "SELECT count(*)::int AS n FROM pg_tables WHERE schemaname = $1",
      [CHECKPOINT_SCHEMA],
    )
    if ((tables.rows[0] as { n: number }).n === 0) {
      throw new Error("langgraph schema is empty — run `pnpm db:migrate` first")
    }
  })

  afterAll(async () => {
    await admin?.end()
    rmSync(dir, { recursive: true, force: true })
  })

  it("pauses, survives SIGKILL, and resumes from the checkpoint", async () => {
    const tenantId = randomUUID()
    const taskId = randomUUID()
    const probe = path.join(dir, `${taskId}.log`)

    // 1. Start. Pauses at the gate; the process stays alive holding the pool.
    const first = runHarness(["start", tenantId, taskId], probe)
    const paused = await first.result
    expect(paused).toMatchObject({ status: "awaiting_approval", gate: { kind: "approval" } })
    const shortlist = (paused as Extract<StageResult, { status: "awaiting_approval" }>).gate.items
    expect(shortlist).toHaveLength(3)

    // 3. Kill it hard. No graceful shutdown, no pool.end().
    await first.kill()

    // Checkpoint rows exist under the tenant-prefixed thread id.
    const rows = await admin.query(
      `SELECT count(*)::int AS n FROM ${CHECKPOINT_SCHEMA}.checkpoints WHERE thread_id LIKE $1`,
      [`tenant:${tenantId}:%`],
    )
    expect((rows.rows[0] as { n: number }).n).toBeGreaterThan(0)

    // 2. A brand-new process sees the pause.
    const status = await runHarness(["status", tenantId, taskId], probe).result
    expect(status).toEqual(paused)

    // 4 + 5. A third process resumes, keeping two of the three suburbs.
    const keep = shortlist.slice(0, 2)
    const done = await runHarness(
      ["resume", tenantId, taskId, JSON.stringify({ approved: true, keep })],
      probe,
    ).result
    expect(done).toEqual({ status: "completed", output: { approved: true, items: keep } })

    const lines = probeLines(probe)
    // prepare ran once, in the killed process — resume did not restart the graph.
    expect(count(lines, "prepare")).toBe(1)
    // The gate node re-executes from the top on resume. This is LangGraph's
    // documented behaviour and the rule every Phase 1 gate must respect.
    expect(count(lines, "approval_gate")).toBe(2)
    expect(count(lines, "finalise")).toBe(1)
    // ...and the re-run happened in a different process from the first.
    const pids = new Set(lines.map((line) => line.pid))
    expect(pids.size).toBe(2)
  })

  it("refuses to resume a stage that is not paused", async () => {
    const tenantId = randomUUID()
    const taskId = randomUUID()
    const probe = path.join(dir, `${taskId}.log`)
    const decision = JSON.stringify({ approved: false })

    const neverStarted = await runHarness(["resume", tenantId, taskId, decision], probe).result
    expect(neverStarted).toMatchObject({ harnessError: expect.stringContaining("not_started") })

    const first = runHarness(["start", tenantId, taskId], probe)
    await first.result
    await first.kill()

    const rejected = await runHarness(["resume", tenantId, taskId, decision], probe).result
    expect(rejected).toEqual({ status: "completed", output: { approved: false, items: [] } })

    // Double-click on "approve": second resume must fail, not silently no-op.
    const again = await runHarness(["resume", tenantId, taskId, decision], probe).result
    expect(again).toMatchObject({ harnessError: expect.stringContaining("completed") })
    expect(count(probeLines(probe), "finalise")).toBe(1)
  })

  it("rejects a malformed decision before it reaches the graph", async () => {
    const tenantId = randomUUID()
    const taskId = randomUUID()
    const probe = path.join(dir, `${taskId}.log`)

    const first = runHarness(["start", tenantId, taskId], probe)
    await first.result
    await first.kill()

    const bad = await runHarness(
      ["resume", tenantId, taskId, JSON.stringify({ approved: "yes" })],
      probe,
    ).result
    expect(bad).toHaveProperty("harnessError")

    const still = await runHarness(["status", tenantId, taskId], probe).result
    expect(still).toMatchObject({ status: "awaiting_approval" })
  })

  it("keeps tenants apart by thread id", async () => {
    const taskId = randomUUID()
    const probe = path.join(dir, `${taskId}.log`)

    const first = runHarness(["start", randomUUID(), taskId], probe)
    await first.result
    await first.kill()

    // Same task id, different tenant: nothing there.
    const other = await runHarness(["status", randomUUID(), taskId], probe).result
    expect(other).toEqual({ status: "not_started" })
  })
})
