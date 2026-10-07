"use client"

import { Badge } from "@/components/ui/badge"
import {
  type CriteriaFormValues,
  FACTOR_LABELS,
  PROPERTY_TYPE_LABELS,
  RISK_LABELS,
  STRATEGY_LABELS,
  filtersCustomised,
  runBlockers,
  weightsCustomised,
} from "@/lib/criteria-form"
import { FACTOR_IDS } from "@my-ba/domain"
import type { ScreeningCostEstimate } from "@my-ba/shared"
import { useFormContext, useWatch } from "react-hook-form"
import { enabledFilterSummaries, formatAudCents, normalisedPercents } from "./criteria-format"

function Row({ label, children }: Readonly<{ label: string; children: React.ReactNode }>) {
  return (
    <div className="grid gap-1 sm:grid-cols-3 sm:gap-4">
      <dt className="font-data text-micro-lg text-ink-dim uppercase">{label}</dt>
      <dd className="text-body text-ink sm:col-span-2">{children}</dd>
    </div>
  )
}

function CostCeiling({ estimate }: Readonly<{ estimate: ScreeningCostEstimate | null }>) {
  if (!estimate) {
    return (
      <p className="text-body-sm text-ink-muted">
        The cost estimate could not be loaded. Saving still works.
      </p>
    )
  }
  const over = estimate.ceilingAud > estimate.budgetAud
  return (
    <div className="space-y-2">
      <p className="text-body text-ink">
        Up to <span className="font-data font-semibold">{formatAudCents(estimate.ceilingAud)}</span>{" "}
        of HtAG data per screening run
        {over ? (
          <span className="text-warn">
            {" "}
            — above the {formatAudCents(estimate.budgetAud)} per-task budget
          </span>
        ) : null}
        .
      </p>
      <ul className="space-y-0.5 text-body-sm text-ink-muted">
        {estimate.lines.map((line) => (
          <li key={line.label}>
            {line.label}: <span className="font-data">{line.rows.toLocaleString("en-AU")}</span>{" "}
            rows × <span className="font-data">{formatAudCents(line.rateAud)}</span> ={" "}
            <span className="font-data">{formatAudCents(line.costAud)}</span>
          </li>
        ))}
      </ul>
      <p className="text-body-sm text-ink-muted">
        A worst case: no cached history and no free allowance. Actual spend is recorded per call.
      </p>
    </div>
  )
}

/** Step 3 (P1-3): criteria and profile summary, preset badge, cost ceiling, run readiness. */
export function ReviewStep({ estimate }: Readonly<{ estimate: ScreeningCostEstimate | null }>) {
  const form = useFormContext<CriteriaFormValues>()
  const values = useWatch({ control: form.control }) as CriteriaFormValues
  const filters = enabledFilterSummaries(values)
  const percents = normalisedPercents(values.weights)
  const blockers = runBlockers(values)

  return (
    <div className="flex flex-col gap-6">
      <dl className="space-y-3 rounded-xl border border-border-card bg-surface px-5 py-4">
        <Row label="Name">{values.name || <span className="text-ink-muted">Not set</span>}</Row>
        <Row label="Strategy">
          {values.strategy && values.risk ? (
            <span className="flex flex-wrap items-center gap-2">
              <Badge variant="default">
                {STRATEGY_LABELS[values.strategy].label} × {RISK_LABELS[values.risk].label}
              </Badge>
              {filtersCustomised(values) ? <Badge variant="outline">Filters custom</Badge> : null}
              {weightsCustomised(values) ? <Badge variant="outline">Weights custom</Badge> : null}
            </span>
          ) : (
            <span className="text-ink-muted">Not chosen</span>
          )}
        </Row>
        <Row label="States">
          {values.states.length ? (
            values.states.join(", ")
          ) : (
            <span className="text-ink-muted">None</span>
          )}
        </Row>
        <Row label="Property type">
          {values.propertyType ? PROPERTY_TYPE_LABELS[values.propertyType] : "Not set"}
        </Row>
        <Row label="Filters">
          {filters.length || values.highConfidenceOnly ? (
            <ul className="space-y-0.5">
              {filters.map((f) => (
                <li key={f.field}>
                  {f.label}: <span className="font-data">{f.text}</span>
                </li>
              ))}
              {values.highConfidenceOnly ? (
                <li>High-confidence data only</li>
              ) : filters.length ? (
                <li>Any confidence</li>
              ) : null}
            </ul>
          ) : (
            <span className="text-ink-muted">None enabled</span>
          )}
        </Row>
        <Row label="Ranking weights">
          {percents ? (
            <ul className="space-y-0.5">
              {FACTOR_IDS.filter((id) => percents[id] > 0).map((id) => (
                <li key={id}>
                  {FACTOR_LABELS[id]}: <span className="font-data">{percents[id]}%</span>
                </li>
              ))}
            </ul>
          ) : (
            <span className="text-ink-muted">Not set</span>
          )}
        </Row>
      </dl>

      <section aria-labelledby="cost-heading" className="space-y-2">
        <h3 id="cost-heading" className="text-card-title text-ink">
          Estimated HtAG cost ceiling
        </h3>
        <CostCeiling estimate={estimate} />
      </section>

      <section aria-labelledby="readiness-heading" className="space-y-2">
        <h3 id="readiness-heading" className="text-card-title text-ink">
          Ready to run?
        </h3>
        {blockers.length === 0 ? (
          <p className="text-body-sm text-pos">These criteria are complete enough to run.</p>
        ) : (
          <ul className="list-disc space-y-0.5 pl-5 text-body-sm text-ink-muted">
            {blockers.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
