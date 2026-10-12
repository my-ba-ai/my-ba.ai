import { eq, inArray } from "drizzle-orm"
import { randomUUID } from "node:crypto"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import type { SalResolution } from "../abs/sal-resolver"
import { createDatabase, createPool, type Database, type DatabasePool } from "../client"
import { loadEnvFiles, parseDbEnv } from "../env"
import { createHtagCallRecorder } from "../htag-call-recorder"
import {
  analysisSteps,
  htagCalls,
  purchaseTasks,
  screeningResults,
  suburbMetricsTs,
  suburbs,
  tenants,
  users,
} from "../schema"
import { withSystemTenant, withTenant } from "../tenant"
import { readMetricPoints, upsertMetricPoints } from "./metrics"
import {
  beginAnalysisStep,
  completeScreeningStep,
  failAnalysisStep,
  readScreeningResults,
} from "./steps"
import { ensureSuburb, type DiscoveredSuburb } from "./suburbs"

/**
 * P1-4 helpers against the migrated docker Postgres, as the app role. Test
 * suburbs use `TSS` HtAG ids and are deleted afterwards.
 */
const tenantA = randomUUID()
const tenantB = randomUUID()
const userA = randomUUID()
const taskA = randomUUID()
const AREA_IDS = ["TSS1", "TSS2", "TSS3"]

let pool: DatabasePool
let db: Database

const nameMatch = (code: string): SalResolution => ({
  salCode: code,
  method: "name",
  postcode: null,
  lookups: 0,
})

beforeAll(async () => {
  loadEnvFiles()
  pool = createPool({
    connectionString: parseDbEnv().DATABASE_URL,
    max: 4,
    applicationName: "db-it-screening",
  })
  db = createDatabase(pool)
  await Promise.all(
    [tenantA, tenantB].map((id) =>
      withTenant(db, id, (tx) =>
        tx.insert(tenants).values({ id, name: `p1-4 ${id}`, slug: `p1-4-${id}` }),
      ),
    ),
  )
  await withTenant(db, tenantA, async (tx) => {
    await tx.insert(users).values({
      id: userA,
      tenantId: tenantA,
      externalAuthId: `user_p14_${userA}`,
      email: "p14@example.com",
    })
    await tx
      .insert(purchaseTasks)
      .values({ id: taskA, tenantId: tenantA, userId: userA, name: "P1-4 IT" })
  })
})

afterAll(async () => {
  await withTenant(db, tenantA, async (tx) => {
    await tx.delete(htagCalls).where(eq(htagCalls.tenantId, tenantA))
    await tx.delete(purchaseTasks).where(eq(purchaseTasks.id, taskA))
    await tx.delete(users).where(eq(users.id, userA))
  })
  await withSystemTenant(db, async (tx) => {
    const ids = await tx
      .select({ id: suburbs.id })
      .from(suburbs)
      .where(inArray(suburbs.htagAreaId, AREA_IDS))
    if (ids.length > 0) {
      await tx.delete(suburbMetricsTs).where(
        inArray(
          suburbMetricsTs.suburbId,
          ids.map((r) => r.id),
        ),
      )
    }
    await tx.delete(suburbs).where(inArray(suburbs.htagAreaId, AREA_IDS))
  })
  await Promise.all(
    [tenantA, tenantB].map((id) =>
      withTenant(db, id, (tx) => tx.delete(tenants).where(eq(tenants.id, id))),
    ),
  )
  await pool.end()
})

const discovered = (htagAreaId: string): DiscoveredSuburb => ({
  htagAreaId,
  name: `TESTSCREEN ${htagAreaId}`,
  state: "NSW",
})

describe("ensureSuburb (P1-4 step 3, D73)", () => {
  it("creates the row with its SAL and a locality postcode, then finds it", async () => {
    let lookups = 0
    const deps = {
      resolveSal: async () => nameMatch("SAL99911"),
      lookupPostcode: async () => {
        lookups++
        return "2999"
      },
    }
    const created = await ensureSuburb(db, discovered("TSS1"), deps)
    expect(created).toMatchObject({
      status: "created",
      suburb: { htagAreaId: "TSS1", postcode: "2999", absSalCode: "SAL99911", absSalMatch: "name" },
    })
    const again = await ensureSuburb(db, discovered("TSS1"), deps)
    expect(again.status).toBe("existing")
    expect(lookups).toBe(1)
  })

  it("uses the concordance postcode without a locality call", async () => {
    const result = await ensureSuburb(db, discovered("TSS2"), {
      resolveSal: async () => ({
        salCode: "SAL99912",
        method: "htag_concordance",
        postcode: "2888",
        lookups: 1,
      }),
      lookupPostcode: async () => {
        throw new Error("should not be called")
      },
    })
    expect(result).toMatchObject({ status: "created", suburb: { postcode: "2888" } })
  })

  it("writes nothing when no postcode can be found", async () => {
    const result = await ensureSuburb(db, discovered("TSS3"), {
      resolveSal: async () => ({ salCode: null, method: "unmatched", candidates: 0, lookups: 0 }),
      lookupPostcode: async () => null,
    })
    expect(result).toEqual({ status: "no_postcode", htagAreaId: "TSS3" })
  })

  it("two overlapping screens pay for one lookup (advisory lock per loc_pid)", async () => {
    let lookups = 0
    const deps = {
      resolveSal: async () => {
        lookups++
        await new Promise((resolve) => setTimeout(resolve, 200))
        return nameMatch("SAL99913")
      },
      lookupPostcode: async () => "2777",
    }
    const [a, b] = await Promise.all([
      ensureSuburb(db, discovered("TSS3"), deps),
      ensureSuburb(db, discovered("TSS3"), deps),
    ])
    expect([a.status, b.status].toSorted()).toEqual(["created", "existing"])
    expect(lookups).toBe(1)
  })
})

describe("hydration cache (D40)", () => {
  it("upserts points idempotently and reads them back by window", async () => {
    const [suburb] = await withSystemTenant(db, (tx) =>
      tx.select({ id: suburbs.id }).from(suburbs).where(eq(suburbs.htagAreaId, "TSS1")),
    )
    const points = ["2026-06-30", "2026-07-31", "2026-08-31"].map((periodEnd, i) => ({
      suburbId: suburb!.id,
      metricName: "typical_price",
      periodEnd,
      value: 700_000 + i,
      confidence: null,
    }))
    await upsertMetricPoints(db, "house", points)
    await upsertMetricPoints(db, "house", [{ ...points[2]!, value: 1 }])
    const read = await readMetricPoints(db, {
      suburbIds: [suburb!.id],
      propertyType: "house",
      metricNames: ["typical_price"],
      fromPeriodEnd: "2026-07-01",
    })
    expect(read.map((p) => [p.periodEnd, p.value]).toSorted()).toEqual([
      ["2026-07-31", 700_001],
      ["2026-08-31", 1],
    ])
  })
})

describe("analysis_steps and screening_results (tenant-scoped)", () => {
  it("opens, costs from the ledger, completes, and is invisible to another tenant", async () => {
    const ref = { tenantId: tenantA, taskId: taskA, stage: "screening" as const, attempt: 1 }
    const meta = { presetVersion: "v1", weightsCustomised: false, filtersCustomised: true }
    const stepId = await beginAnalysisStep(db, ref, meta)
    expect(await beginAnalysisStep(db, ref, meta)).toBe(stepId)

    const recorder = createHtagCallRecorder(db, {
      tenantId: tenantA,
      taskId: taskA,
      analysisStepId: stepId,
    })
    const record = (costAud: string) =>
      recorder.record({
        endpoint: "/markets/query",
        request: {},
        rowsReturned: 10,
        tier: "premium",
        costAud,
        costSource: "header",
        billedUnits: 10,
        billingBalanceAud: null,
        billingTier: null,
        statusCode: 200,
      })
    // Sequential, like the client: one ledger row per HtAG response.
    await record("1.2100")
    await record("0.0740")

    const [suburb] = await withSystemTenant(db, (tx) =>
      tx.select({ id: suburbs.id }).from(suburbs).where(eq(suburbs.htagAreaId, "TSS1")),
    )
    const cost = await completeScreeningStep(db, {
      tenantId: tenantA,
      taskId: taskA,
      analysisStepId: stepId,
      outcome: "ranked",
      request: { q: 1 },
      result: { survivors: 1 },
      results: [
        {
          suburbId: suburb!.id,
          htagAreaId: "TSS1",
          rank: 1,
          score: 0.8,
          coverage: 1,
          insufficientData: false,
          ranked: { areaId: "TSS1" },
          supply: null,
          shortlisted: true,
        },
      ],
    })
    expect(cost).toBe("1.2840")

    const rows = await readScreeningResults(db, tenantA, stepId)
    expect(rows).toMatchObject([{ rank: 1, htagAreaId: "TSS1", postcode: "2999" }])
    expect(await readScreeningResults(db, tenantB, stepId)).toEqual([])
    const visibleToB = await withTenant(db, tenantB, (tx) =>
      tx.select().from(analysisSteps).where(eq(analysisSteps.id, stepId)),
    )
    expect(visibleToB).toEqual([])
  })

  it("a typed failure is recorded and the same attempt can be reopened (AC 5)", async () => {
    const ref = { tenantId: tenantA, taskId: taskA, stage: "screening" as const, attempt: 2 }
    const meta = { presetVersion: null, weightsCustomised: null, filtersCustomised: null }
    const stepId = await beginAnalysisStep(db, ref, meta)
    await failAnalysisStep(db, {
      tenantId: tenantA,
      analysisStepId: stepId,
      reason: "HTAG_QUOTA_EXCEEDED",
      detail: "quota",
    })
    const [failed] = await withTenant(db, tenantA, (tx) =>
      tx.select().from(analysisSteps).where(eq(analysisSteps.id, stepId)),
    )
    expect(failed).toMatchObject({ status: "failed", failureReason: "HTAG_QUOTA_EXCEEDED" })

    expect(await beginAnalysisStep(db, ref, meta)).toBe(stepId)
    const [reopened] = await withTenant(db, tenantA, (tx) =>
      tx.select().from(analysisSteps).where(eq(analysisSteps.id, stepId)),
    )
    expect(reopened).toMatchObject({ status: "running", failureReason: null })
    await withTenant(db, tenantA, (tx) =>
      tx.delete(screeningResults).where(eq(screeningResults.taskId, taskA)),
    )
  })
})
