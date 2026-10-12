import { HTAG_BEDROOMS_ALL } from "@my-ba/shared"
import { and, eq, gte, inArray, sql } from "drizzle-orm"
import type { Database } from "../client"
import { suburbMetricsTs } from "../schema"
import { withSystemTenant } from "../tenant"

/** One cached series point. `periodEnd` is HtAG's `period_end`, `YYYY-MM-DD`. */
export interface MetricPoint {
  suburbId: string
  metricName: string
  periodEnd: string
  value: number
  confidence: string | null
}

const toDate = (periodEnd: string) => new Date(`${periodEnd}T00:00:00.000Z`)
const toPeriodEnd = (date: Date) => date.toISOString().slice(0, 10)

/**
 * Cached points from the hydration cache (D40), for the screener's cache diff
 * (P1-4 step 4, AC 3). `bedrooms` is always `'All'` (D40).
 */
export async function readMetricPoints(
  db: Database,
  query: {
    suburbIds: readonly string[]
    propertyType: string
    metricNames: readonly string[]
    /** Inclusive, `YYYY-MM-DD`. */
    fromPeriodEnd: string
  },
): Promise<MetricPoint[]> {
  if (query.suburbIds.length === 0 || query.metricNames.length === 0) return []
  const rows = await withSystemTenant(db, (tx) =>
    tx
      .select({
        suburbId: suburbMetricsTs.suburbId,
        metricName: suburbMetricsTs.metricName,
        measuredAt: suburbMetricsTs.measuredAt,
        value: suburbMetricsTs.value,
        confidence: suburbMetricsTs.confidence,
      })
      .from(suburbMetricsTs)
      .where(
        and(
          inArray(suburbMetricsTs.suburbId, [...query.suburbIds]),
          eq(suburbMetricsTs.propertyType, query.propertyType),
          eq(suburbMetricsTs.bedrooms, HTAG_BEDROOMS_ALL),
          inArray(suburbMetricsTs.metricName, [...query.metricNames]),
          gte(suburbMetricsTs.measuredAt, toDate(query.fromPeriodEnd)),
        ),
      ),
  )
  return rows.map(({ measuredAt, ...row }) => ({ ...row, periodEnd: toPeriodEnd(measuredAt) }))
}

const UPSERT_BATCH = 1_000

/**
 * Writes fetched points into the cache. Keyed exactly as HtAG bills (D40), so
 * re-fetching an unchanged period overwrites the same row. Idempotent.
 */
export async function upsertMetricPoints(
  db: Database,
  propertyType: string,
  points: readonly MetricPoint[],
): Promise<number> {
  if (points.length === 0) return 0
  return withSystemTenant(db, async (tx) => {
    const writeFrom = async (start: number): Promise<void> => {
      const batch = points.slice(start, start + UPSERT_BATCH)
      if (batch.length === 0) return
      await tx
        .insert(suburbMetricsTs)
        .values(
          batch.map((point) => ({
            suburbId: point.suburbId,
            propertyType,
            bedrooms: HTAG_BEDROOMS_ALL,
            metricName: point.metricName,
            measuredAt: toDate(point.periodEnd),
            value: point.value,
            confidence: point.confidence,
            source: "HTAG",
          })),
        )
        .onConflictDoUpdate({
          target: [
            suburbMetricsTs.suburbId,
            suburbMetricsTs.propertyType,
            suburbMetricsTs.bedrooms,
            suburbMetricsTs.metricName,
            suburbMetricsTs.measuredAt,
          ],
          set: { value: sql.raw("excluded.value"), confidence: sql.raw("excluded.confidence") },
        })
      await writeFrom(start + UPSERT_BATCH)
    }
    await writeFrom(0)
    return points.length
  })
}
