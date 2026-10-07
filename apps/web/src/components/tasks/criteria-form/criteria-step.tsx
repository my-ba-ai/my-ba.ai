"use client"

import { Badge } from "@/components/ui/badge"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import {
  type CriteriaFormValues,
  FACTOR_LABELS,
  FILTER_DEFINITIONS,
  type FilterDefinition,
  RISK_LABELS,
  STRATEGY_LABELS,
  filtersCustomised,
  weightsCustomised,
} from "@/lib/criteria-form"
import { FACTOR_IDS } from "@my-ba/domain"
import { Controller, useFormContext, useWatch } from "react-hook-form"
import { normalisedPercents } from "./criteria-format"

function NumberInput({
  def,
  part,
  disabled,
  label,
}: Readonly<{
  def: FilterDefinition
  part: "min" | "max" | "value"
  disabled: boolean
  label: string
}>) {
  const form = useFormContext<CriteriaFormValues>()
  const error = form.formState.errors.filters?.[def.field]?.[part]
  const id = `filter-${def.field}-${part}`
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="font-data text-micro-lg text-ink-dim uppercase">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          type="number"
          inputMode={def.integer ? "numeric" : "decimal"}
          step={def.step}
          disabled={disabled}
          aria-invalid={!!error}
          className="w-36 font-data"
          {...form.register(`filters.${def.field}.${part}`, { valueAsNumber: true })}
        />
        <span className="text-body-sm text-ink-muted">{def.unit}</span>
      </div>
      <FieldError errors={[error]} />
    </div>
  )
}

function FilterRow({ def }: Readonly<{ def: FilterDefinition }>) {
  const form = useFormContext<CriteriaFormValues>()
  const enabled = useWatch({ control: form.control, name: `filters.${def.field}.enabled` })
  const switchId = `filter-${def.field}-enabled`
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border-card bg-surface px-4 py-3.5 sm:flex-row sm:items-start sm:justify-between">
      <Field orientation="horizontal" className="sm:max-w-sm">
        <Controller
          control={form.control}
          name={`filters.${def.field}.enabled`}
          render={({ field }) => (
            <Switch
              id={switchId}
              checked={field.value}
              onCheckedChange={(checked) => field.onChange(checked)}
            />
          )}
        />
        <FieldContent>
          <FieldLabel htmlFor={switchId}>{def.label}</FieldLabel>
          <FieldDescription>{def.helper}</FieldDescription>
        </FieldContent>
      </Field>
      <div className="flex flex-wrap gap-3">
        {def.kind === "range" ? (
          <>
            <NumberInput def={def} part="min" disabled={!enabled} label="Min" />
            <NumberInput def={def} part="max" disabled={!enabled} label="Max" />
          </>
        ) : (
          <NumberInput
            def={def}
            part="value"
            disabled={!enabled}
            label={def.kind === "max" ? "At most" : "At least"}
          />
        )}
      </div>
    </div>
  )
}

function WeightsPanel() {
  const form = useFormContext<CriteriaFormValues>()
  const weights = useWatch({ control: form.control, name: "weights" })
  const percents = normalisedPercents(weights)
  const error = form.formState.errors.weights

  return (
    <details className="group rounded-xl border border-border-card bg-surface-sunk px-4 py-3">
      <summary className="cursor-pointer text-card-title text-ink">
        Customise ranking weights
      </summary>
      <p className="mt-2 max-w-prose text-body-sm text-ink-muted">
        Weights decide the order of suburbs that pass the filters. They are rescaled to add up to
        100% when you save.
      </p>
      <FieldGroup className="mt-4">
        {FACTOR_IDS.map((id) => (
          <Controller
            key={id}
            control={form.control}
            name={`weights.${id}`}
            render={({ field }) => (
              <Field>
                <div className="flex items-baseline justify-between gap-4">
                  <FieldLabel id={`weight-${id}-label`}>{FACTOR_LABELS[id]}</FieldLabel>
                  <span className="font-data text-value text-ink-3">
                    {percents ? `${percents[id]}%` : "–"}
                  </span>
                </div>
                <Slider
                  aria-labelledby={`weight-${id}-label`}
                  value={[field.value]}
                  onValueChange={(value) =>
                    field.onChange(typeof value === "number" ? value : (value[0] ?? 0))
                  }
                  min={0}
                  max={100}
                  step={1}
                />
              </Field>
            )}
          />
        ))}
      </FieldGroup>
      {error ? (
        <p role="alert" className="mt-3 text-body-sm text-neg">
          {error.message ?? error.root?.message}
        </p>
      ) : null}
    </details>
  )
}

/** Step 2 (P1-3): toggleable hard filters (D43, D68) and the ranking weights. */
export function CriteriaStep() {
  const form = useFormContext<CriteriaFormValues>()
  const values = useWatch({ control: form.control }) as CriteriaFormValues
  const preset =
    values.strategy && values.risk
      ? `${STRATEGY_LABELS[values.strategy].label} × ${RISK_LABELS[values.risk].label}`
      : null

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 text-body-sm text-ink-muted">
        {preset ? (
          <>
            Prefilled based on strategy <Badge>{preset}</Badge>
            {filtersCustomised(values) ? <Badge variant="outline">Filters customised</Badge> : null}
            {weightsCustomised(values) ? <Badge variant="outline">Weights customised</Badge> : null}
          </>
        ) : (
          "Choose a strategy and risk tolerance in step 1 to prefill these from a preset."
        )}
      </div>

      {FILTER_DEFINITIONS.map((def) => (
        <FilterRow key={def.field} def={def} />
      ))}

      <Controller
        control={form.control}
        name="highConfidenceOnly"
        render={({ field }) => (
          <Field
            orientation="horizontal"
            className="rounded-xl border border-border-card bg-surface px-4 py-3.5"
          >
            <Switch
              id="filter-high-confidence"
              checked={field.value}
              onCheckedChange={(checked) => field.onChange(checked)}
            />
            <FieldContent>
              <FieldTitle>
                <label htmlFor="filter-high-confidence">High-confidence data only</label>
              </FieldTitle>
              <FieldDescription>
                Skip suburbs where HtAG rates its own estimate as medium or low confidence.
              </FieldDescription>
            </FieldContent>
          </Field>
        )}
      />

      <WeightsPanel />
    </div>
  )
}
