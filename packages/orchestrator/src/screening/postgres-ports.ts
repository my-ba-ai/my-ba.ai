import {
  completeScreeningStep,
  createHtagCallRecorder,
  createSalResolver,
  beginAnalysisStep,
  ensureSuburb,
  failAnalysisStep,
  loadSalNameIndex,
  loadTaskCriteria,
  readMetricPoints,
  renterProportionsBySalCode,
  resolvePendingSuburbs,
  SYSTEM_TENANT_ID,
  unresolvedSalAreaIds,
  upsertMetricPoints,
  type Database,
  type KnownSuburb,
  type SalResolver,
} from "@my-ba/db"
import { createHtagClient, type HtagClientConfig, type HtagLogger } from "@my-ba/htag-client"
import type { ScreeningPorts } from "./ports"

export interface PostgresScreeningPortsOptions {
  /** The worker's app-role database (never the migration role). */
  db: Database
  htag: HtagClientConfig
  htagLogger?: HtagLogger
}

/**
 * `ScreeningPorts` over Postgres and the live HtAG API. Two kinds of HtAG
 * client:
 *
 * - per step, recording against the task's tenant, task and step — the spend
 *   `analysis_steps.cost_aud` is summed from (AC 4);
 * - one system-tenant client with no task, for reference data on the way:
 *   SAL concordance and locality postcodes (D72, D73).
 */
export function createPostgresScreeningPorts(
  options: PostgresScreeningPortsOptions,
): ScreeningPorts {
  const { db } = options
  const deps = (scope: Parameters<typeof createHtagCallRecorder>[1]) => ({
    recorder: createHtagCallRecorder(db, scope),
    ...(options.htagLogger ? { logger: options.htagLogger } : {}),
  })
  const systemClient = createHtagClient(options.htag, deps({ tenantId: SYSTEM_TENANT_ID }))

  // The SAL name index is ~15k rows; built once per process, on first use.
  let resolver: Promise<SalResolver> | null = null
  const getResolver = () => {
    resolver ??= loadSalNameIndex(db).then((index) =>
      createSalResolver({
        index,
        lookup: async (salCode) => {
          const row = await systemClient.salToLocality(salCode)
          return row ? { locPid: row.loc_pid, postcode: row.postcode } : null
        },
      }),
    )
    resolver.catch(() => {
      resolver = null
    })
    return resolver
  }

  return {
    async loadCriteria(tenantId, taskId) {
      const row = await loadTaskCriteria(db, tenantId, taskId)
      return row?.criteria ?? null
    },

    beginStep: ({ tenantId, taskId, attempt, ...meta }) =>
      beginAnalysisStep(db, { tenantId, taskId, stage: "screening", attempt }, meta),

    htagClient: (scope) => createHtagClient(options.htag, deps(scope)),

    async ensureSuburbs(discovered) {
      const sal = await getResolver()
      // Suburbs that exist but predate P1-10 resolution get their SAL first,
      // through P1-10's own row-locked path.
      const pending = await unresolvedSalAreaIds(
        db,
        discovered.map((d) => d.htagAreaId),
      )
      if (pending.length > 0) await resolvePendingSuburbs(db, sal, { htagAreaIds: pending })

      const known = new Map<string, KnownSuburb>()
      const dropped: string[] = []
      // One at a time: SAL fallbacks and locality lookups are billed per call.
      const next = async (index: number): Promise<void> => {
        const suburb = discovered[index]
        if (!suburb) return
        const result = await ensureSuburb(db, suburb, {
          resolveSal: (s) => sal.resolve(s),
          lookupPostcode: async (htagAreaId) =>
            (await systemClient.locality(htagAreaId))?.postcode ?? null,
        })
        if ("suburb" in result) {
          known.set(suburb.htagAreaId, result.suburb)
        } else {
          dropped.push(result.htagAreaId)
        }
        return next(index + 1)
      }
      await next(0)
      return { known, dropped }
    },

    readMetricPoints: (query) => readMetricPoints(db, query),

    async writeMetricPoints(propertyType, points) {
      await upsertMetricPoints(db, propertyType, points)
    },

    renterProportions: (salCodes) => renterProportionsBySalCode(db, salCodes),

    completeStep: ({ outcome, ...input }) => completeScreeningStep(db, { outcome, ...input }),

    failStep: (input) => failAnalysisStep(db, input),
  }
}
