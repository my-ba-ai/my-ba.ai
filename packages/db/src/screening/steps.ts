import { and, asc, eq, sql } from "drizzle-orm"
import type { Database } from "../client"
import {
  analysisSteps,
  htagCalls,
  purchaseTasks,
  screeningResults,
  suburbs,
  type AnalysisFailureReason,
  type AnalysisStage,
  type ScreeningOutcome,
  type ScreeningSupplyDetail,
} from "../schema"
import { withTenant } from "../tenant"

export interface StepRef {
  tenantId: string
  taskId: string
  stage: AnalysisStage
  attempt: number
}

/** The task's stored criteria, unparsed (jsonb `DraftCriteria`). Null when the task is not visible. */
export async function loadTaskCriteria(
  db: Database,
  tenantId: string,
  taskId: string,
): Promise<{ criteria: unknown; status: string } | null> {
  const [row] = await withTenant(db, tenantId, (tx) =>
    tx
      .select({ criteria: purchaseTasks.criteria, status: purchaseTasks.status })
      .from(purchaseTasks)
      .where(eq(purchaseTasks.id, taskId)),
  )
  return row ?? null
}

/**
 * Opens (or reopens) the row for one attempt and returns its id. Written
 * before the first HtAG call so the ledger can point at it.
 *
 * Re-running the same attempt — after a crash, or a retry after a typed
 * failure (AC 5) — reuses the row and puts it back to `running`. Spend
 * already recorded against it stays: that money was spent.
 */
export async function beginAnalysisStep(
  db: Database,
  ref: StepRef,
  meta: {
    presetVersion: string | null
    weightsCustomised: boolean | null
    filtersCustomised: boolean | null
  },
): Promise<string> {
  const [row] = await withTenant(db, ref.tenantId, (tx) =>
    tx
      .insert(analysisSteps)
      .values({
        tenantId: ref.tenantId,
        taskId: ref.taskId,
        stage: ref.stage,
        attempt: ref.attempt,
        status: "running",
        ...meta,
      })
      .onConflictDoUpdate({
        target: [analysisSteps.taskId, analysisSteps.stage, analysisSteps.attempt],
        set: {
          status: "running",
          outcome: null,
          failureReason: null,
          failureDetail: null,
          finishedAt: null,
          updatedAt: sql`now()`,
          ...meta,
        },
      })
      .returning({ id: analysisSteps.id }),
  )
  if (!row) throw new Error(`could not open analysis step for task ${ref.taskId}`)
  return row.id
}

/** AUD spent by this step, from the ledger (AC 4, D62). Decimal string, 4 dp. */
export async function sumStepCost(
  db: Database,
  tenantId: string,
  analysisStepId: string,
): Promise<string> {
  const [row] = await withTenant(db, tenantId, (tx) =>
    tx
      .select({ total: sql<string>`coalesce(sum(${htagCalls.costAud}), 0)::numeric(10, 4)::text` })
      .from(htagCalls)
      .where(eq(htagCalls.analysisStepId, analysisStepId)),
  )
  return row?.total ?? "0.0000"
}

export interface ScreeningResultInput {
  suburbId: string
  htagAreaId: string
  rank: number
  score: number | null
  coverage: number
  insufficientData: boolean
  /** P1-8 `Ranked`, verbatim. */
  ranked: Record<string, unknown>
  supply: ScreeningSupplyDetail | null
  shortlisted: boolean
}

/**
 * Completes the attempt: replaces its results (idempotent on a re-run), sums
 * its cost from the ledger and stamps the outcome, in one transaction.
 * Returns the stored cost.
 */
export async function completeScreeningStep(
  db: Database,
  input: {
    tenantId: string
    taskId: string
    analysisStepId: string
    outcome: ScreeningOutcome
    request: Record<string, unknown>
    result: Record<string, unknown>
    results: readonly ScreeningResultInput[]
  },
): Promise<string> {
  const costAud = await sumStepCost(db, input.tenantId, input.analysisStepId)
  await withTenant(db, input.tenantId, async (tx) => {
    await tx
      .delete(screeningResults)
      .where(eq(screeningResults.analysisStepId, input.analysisStepId))
    if (input.results.length > 0) {
      await tx.insert(screeningResults).values(
        input.results.map((r) => ({
          tenantId: input.tenantId,
          taskId: input.taskId,
          analysisStepId: input.analysisStepId,
          suburbId: r.suburbId,
          htagAreaId: r.htagAreaId,
          rank: r.rank,
          score: r.score,
          coverage: r.coverage,
          insufficientData: r.insufficientData,
          scoreBreakdownJson: r.ranked,
          supplyJson: r.supply,
          shortlisted: r.shortlisted,
        })),
      )
    }
    await tx
      .update(analysisSteps)
      .set({
        status: "completed",
        outcome: input.outcome,
        requestJson: input.request,
        resultJson: input.result,
        costAud,
        finishedAt: sql`now()`,
        updatedAt: sql`now()`,
      })
      .where(eq(analysisSteps.id, input.analysisStepId))
  })
  return costAud
}

/** Marks the attempt failed with a typed reason (AC 5). Cost so far is still summed. */
export async function failAnalysisStep(
  db: Database,
  input: {
    tenantId: string
    analysisStepId: string
    reason: AnalysisFailureReason
    detail: string
    request?: Record<string, unknown>
  },
): Promise<void> {
  const costAud = await sumStepCost(db, input.tenantId, input.analysisStepId)
  await withTenant(db, input.tenantId, (tx) =>
    tx
      .update(analysisSteps)
      .set({
        status: "failed",
        outcome: null,
        failureReason: input.reason,
        failureDetail: input.detail.slice(0, 2_000),
        ...(input.request ? { requestJson: input.request } : {}),
        costAud,
        finishedAt: sql`now()`,
        updatedAt: sql`now()`,
      })
      .where(eq(analysisSteps.id, input.analysisStepId)),
  )
}

/** A step's results joined to their suburbs, rank order. For P1-5 and the integration test. */
export async function readScreeningResults(db: Database, tenantId: string, analysisStepId: string) {
  return withTenant(db, tenantId, (tx) =>
    tx
      .select({
        rank: screeningResults.rank,
        htagAreaId: screeningResults.htagAreaId,
        suburbId: screeningResults.suburbId,
        name: suburbs.name,
        state: suburbs.state,
        postcode: suburbs.postcode,
        score: screeningResults.score,
        coverage: screeningResults.coverage,
        insufficientData: screeningResults.insufficientData,
        scoreBreakdownJson: screeningResults.scoreBreakdownJson,
        supplyJson: screeningResults.supplyJson,
        shortlisted: screeningResults.shortlisted,
      })
      .from(screeningResults)
      .innerJoin(suburbs, eq(suburbs.id, screeningResults.suburbId))
      .where(and(eq(screeningResults.analysisStepId, analysisStepId)))
      .orderBy(asc(screeningResults.rank)),
  )
}
