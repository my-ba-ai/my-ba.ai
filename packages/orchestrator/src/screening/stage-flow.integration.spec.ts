import {
  beginAnalysisStep,
  changeTaskStatus,
  completeScreeningStep,
  createDatabase,
  createPool,
  type Database,
  type DatabasePool,
  decideGate,
  failAnalysisStep,
  loadEnvFiles,
  loadTaskCriteria,
  purchaseTasks,
  readLatestStep,
  type TenantTransaction,
  tenants,
  users,
  withTenant,
} from "@my-ba/db"
import { screeningJobSchema } from "@my-ba/shared"
import { randomUUID } from "node:crypto"
import path from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { areas, FakePorts, validCriteria } from "../../test/screening-fakes"
import { parseOrchestratorEnv } from "../env"
import { LangGraphOrchestrator } from "../langgraph-orchestrator"
import { DEFAULT_SCREENING_CONFIG } from "./config"
import { handleScreeningJob } from "./job"
import type { ScreeningPorts } from "./ports"
import { createPostgresStageSync } from "./stage-sync"

/**
 * P1-6 AC 10. Needs `pnpm db:up && pnpm db:migrate`.
 *
 * The real job handler (what the worker runs), a real `LangGraphOrchestrator`
 * on the Postgres checkpointer, and the real status / gate sync, as
 * `my_ba_app`. HtAG is the in-memory fake; the attempt rows, criteria and
 * gates are real `analysis_steps` / `purchase_tasks` rows. The API side (Run,
 * Reject & Adjust, editing criteria) is done with the same db helpers
 * `ScreeningRunService` calls.
 *
 *   run → approval gate → Reject & Adjust → edit → run → approval gate
 *   → (new orchestrator, as after a worker restart) → approve → TREND_ANALYSIS
 */

const PACKAGE_ROOT = path.resolve(__dirname, "../..")
loadEnvFiles(PACKAGE_ROOT)
const env = parseOrchestratorEnv()

/** FakePorts for HtAG, suburbs and the metric cache; step rows and criteria go to Postgres. */
function dbBackedPorts(db: Database, fake: FakePorts): ScreeningPorts {
  return {
    loadCriteria: async (tenantId, taskId) =>
      (await loadTaskCriteria(db, tenantId, taskId))?.criteria ?? null,
    beginStep: ({ tenantId, taskId, attempt, ...meta }) =>
      beginAnalysisStep(db, { tenantId, taskId, stage: "screening", attempt }, meta),
    htagClient: (scope) => fake.htagClient(scope),
    ensureSuburbs: (discovered) => fake.ensureSuburbs(discovered),
    readMetricPoints: (query) => fake.readMetricPoints(query),
    writeMetricPoints: (propertyType, points) => fake.writeMetricPoints(propertyType, points),
    renterProportions: (salCodes) => fake.renterProportions(salCodes),
    // Results reference fake suburb ids (no `suburbs` rows); the flow under
    // test is the attempt row and its gate, so they are not persisted here.
    completeStep: (input) => completeScreeningStep(db, { ...input, results: [] }),
    failStep: (input) => failAnalysisStep(db, input),
  }
}

/** Test-only raw SQL in the tenant's scope (this package has no drizzle-orm dependency). */
const exec = (tx: TenantTransaction, statement: string) => tx.execute(statement)

const tenantId = randomUUID()
const userId = randomUUID()
const taskId = randomUUID()

let pool: DatabasePool
let db: Database

const newOrchestrator = (ports: ScreeningPorts) =>
  LangGraphOrchestrator.fromEnv(process.env, {
    screening: { ports, config: { ...DEFAULT_SCREENING_CONFIG, queryLimit: 100 } },
  })

const job = (action: "run" | "approve", extra: Record<string, unknown> = {}) =>
  screeningJobSchema.parse({
    tenantId,
    requestedBy: userId,
    requestedAt: new Date().toISOString(),
    taskId,
    action,
    ...extra,
  })

const taskStatus = async () =>
  (
    await withTenant(db, tenantId, (tx) =>
      tx.query.purchaseTasks.findFirst({ where: (t, { eq }) => eq(t.id, taskId) }),
    )
  )?.status

const steps = () =>
  withTenant(db, tenantId, (tx) =>
    tx.query.analysisSteps.findMany({
      where: (t, { eq }) => eq(t.taskId, taskId),
      orderBy: (t, { asc }) => [asc(t.attempt)],
    }),
  )

beforeAll(async () => {
  pool = createPool({ connectionString: env.DATABASE_URL, max: 4, applicationName: "orch-it-p1-6" })
  db = createDatabase(pool)
  await withTenant(db, tenantId, async (tx) => {
    await tx
      .insert(tenants)
      .values({ id: tenantId, name: `p1-6 ${tenantId}`, slug: `p1-6-${tenantId}` })
    await tx.insert(users).values({
      id: userId,
      tenantId,
      externalAuthId: `user_p16_${userId}`,
      email: "p16@example.com",
    })
    await tx.insert(purchaseTasks).values({
      id: taskId,
      tenantId,
      userId,
      name: "P1-6 IT",
      criteria: validCriteria(),
    })
  })
})

afterAll(async () => {
  await withTenant(db, tenantId, async (tx) => {
    await exec(tx, `delete from purchase_tasks where tenant_id = '${tenantId}'`)
    await exec(tx, `delete from users where id = '${userId}'`)
    await exec(tx, `delete from tenants where id = '${tenantId}'`)
  })
  await pool.end()
})

describe("P1-6 stage flow against Postgres (AC 10)", () => {
  it("run → reject → edit → re-run → restart → approve, with status and step rows in step", async () => {
    const fake = new FakePorts()
    fake.htag.queryRows = areas(5)
    const ports = dbBackedPorts(db, fake)
    const sync = createPostgresStageSync(db)
    let orchestrator = newOrchestrator(ports)

    try {
      // 1. Run (API side), then the worker's run job.
      await withTenant(db, tenantId, (tx) => changeTaskStatus(tx, taskId, "DRAFT", "SCREENING"))
      const first = await handleScreeningJob({ orchestrator, sync }, job("run"))
      expect(first.status === "awaiting_approval" && first.gate.kind).toBe("SCREENING_APPROVAL")
      expect(await taskStatus()).toBe("SCREENING")
      expect(await steps()).toMatchObject([
        { attempt: 1, status: "completed", gateKind: "SCREENING_APPROVAL", gateStatus: "awaiting" },
      ])

      // 2. Reject & Adjust (API side): no job, task back to DRAFT (AC 4).
      const billedBeforeReject = fake.htag.ledger.length
      await withTenant(db, tenantId, async (tx) => {
        const step = await readLatestStep(tx, taskId, "screening")
        if (!step) throw new Error("no step")
        expect(
          await decideGate(tx, {
            analysisStepId: step.id,
            status: "rejected",
            decision: { approved: false },
            decidedBy: userId,
          }),
        ).toBe(true)
        expect(await changeTaskStatus(tx, taskId, "SCREENING", "DRAFT")).toBe(true)
      })
      expect(await taskStatus()).toBe("DRAFT")
      expect(fake.htag.ledger).toHaveLength(billedBeforeReject)

      // 3. Edit the criteria while in DRAFT, then Run again.
      const edited = validCriteria({ states: ["NSW", "VIC"] })
      await withTenant(db, tenantId, (tx) =>
        exec(
          tx,
          `update purchase_tasks set criteria = '${JSON.stringify(edited)}'::jsonb where id = '${taskId}'`,
        ),
      )
      await withTenant(db, tenantId, (tx) => changeTaskStatus(tx, taskId, "DRAFT", "SCREENING"))
      const second = await handleScreeningJob({ orchestrator, sync }, job("run"))
      expect(second.status).toBe("awaiting_approval")
      if (second.status !== "awaiting_approval") return
      expect(second.gate.kind === "SCREENING_APPROVAL" && second.gate.attempt).toBe(2)
      expect(second.gate.kind === "SCREENING_APPROVAL" && second.gate.criteria.states).toEqual([
        "NSW",
        "VIC",
      ])
      const afterRerun = await steps()
      expect(afterRerun).toMatchObject([
        { attempt: 1, gateStatus: "rejected", gateDecidedBy: userId },
        { attempt: 2, status: "completed", gateStatus: "awaiting" },
      ])

      // 4. A fresh orchestrator (new checkpointer pool), as after a worker
      // restart while paused: the gate is read back from Postgres.
      await orchestrator.close()
      orchestrator = newOrchestrator(ports)
      const keep =
        second.gate.kind === "SCREENING_APPROVAL"
          ? second.gate.rankedSuburbs.slice(0, 2).map((s) => s.areaId)
          : []
      const approved = await handleScreeningJob({ orchestrator, sync }, job("approve", { keep }))
      expect(approved).toEqual({ status: "completed", output: { approved: true, items: keep } })

      expect(await taskStatus()).toBe("TREND_ANALYSIS")
      const final = await steps()
      expect(final).toHaveLength(2)
      expect(final[0]).toMatchObject({ gateStatus: "rejected" })
      expect(final[1]).toMatchObject({
        gateStatus: "approved",
        gateDecidedBy: userId,
        gateDecision: { approved: true, keep },
      })

      // 5. A redelivered approve job is a no-op, not an error.
      await expect(
        handleScreeningJob({ orchestrator, sync }, job("approve", { keep })),
      ).resolves.toMatchObject({ status: "completed" })
      expect(await taskStatus()).toBe("TREND_ANALYSIS")
    } finally {
      await orchestrator.close()
    }
  })

  it("the gate columns refuse an approved too-broad gate (D42)", async () => {
    const otherTask = randomUUID()
    await withTenant(db, tenantId, (tx) =>
      tx.insert(purchaseTasks).values({ id: otherTask, tenantId, userId, name: "P1-6 IT check" }),
    )
    try {
      const stepId = await beginAnalysisStep(
        db,
        { tenantId, taskId: otherTask, stage: "screening", attempt: 1 },
        { presetVersion: null, weightsCustomised: null, filtersCustomised: null },
      )
      await completeScreeningStep(db, {
        tenantId,
        taskId: otherTask,
        analysisStepId: stepId,
        outcome: "too_broad",
        request: {},
        result: {},
        results: [],
      })
      // Drizzle wraps the driver error ("Failed query: …"); Postgres's own
      // error, which names the violated constraint, is its `cause`.
      const error: unknown = await withTenant(db, tenantId, (tx) =>
        exec(
          tx,
          `update analysis_steps set gate_kind = 'SCREENING_TOO_BROAD', gate_status = 'approved',
               gate_payload = '{}', gate_decision = '{"approved":true}', gate_decided_at = now()
             where id = '${stepId}'`,
        ),
      ).then(
        () => null,
        (e: unknown) => e,
      )
      expect(error).toBeInstanceOf(Error)
      const cause = (error as Error).cause as { code?: string; constraint?: string } | undefined
      expect(cause?.code).toBe("23514") // check_violation
      expect(cause?.constraint).toBe("analysis_steps_gate_too_broad_check")
    } finally {
      await withTenant(db, tenantId, (tx) =>
        exec(tx, `delete from purchase_tasks where id = '${otherTask}'`),
      )
    }
  })
})
