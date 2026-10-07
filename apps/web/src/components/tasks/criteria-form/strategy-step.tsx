"use client"

import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
  useComboboxAnchor,
} from "@/components/ui/combobox"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  PROPERTY_TYPE_LABELS,
  RISK_LABELS,
  STRATEGY_LABELS,
  type CriteriaFormValues,
} from "@/lib/criteria-form"
import { RISK_TOLERANCES, STRATEGIES, type RiskTolerance, type Strategy } from "@my-ba/domain"
import { AU_STATES, HTAG_PROPERTY_TYPES } from "@my-ba/shared"
import { Controller, useFormContext, useWatch } from "react-hook-form"

type ChoiceProps<T extends string> = {
  name: string
  legend: string
  description: string
  options: readonly T[]
  labels: Readonly<Record<T, { label: string; blurb: string }>>
  value: T | null
  onChange: (value: T) => void
}

/** A radio group rendered as choice cards (shadcn `field` pattern on Base UI). */
function ChoiceCards<T extends string>({
  name,
  legend,
  description,
  options,
  labels,
  value,
  onChange,
}: ChoiceProps<T>) {
  return (
    <FieldSet>
      <FieldLegend>{legend}</FieldLegend>
      <FieldDescription>{description}</FieldDescription>
      <RadioGroup
        value={value ?? ""}
        onValueChange={(next) => onChange(next as T)}
        className="grid gap-3 sm:grid-cols-3"
      >
        {options.map((option) => (
          <FieldLabel key={option} htmlFor={`${name}-${option}`} className="cursor-pointer">
            <Field orientation="horizontal">
              <FieldContent>
                <FieldTitle className="text-shadow-sm">{labels[option].label}</FieldTitle>
                <FieldDescription>{labels[option].blurb}</FieldDescription>
              </FieldContent>
              <RadioGroupItem value={option} id={`${name}-${option}`} />
            </Field>
          </FieldLabel>
        ))}
      </RadioGroup>
    </FieldSet>
  )
}

/**
 * Step 1 (P1-3): task name, strategy × risk (which prefill step 2 from the
 * preset), target states and property type.
 */
export function StrategyStep({
  onPresetChange,
}: Readonly<{
  onPresetChange: (strategy: Strategy | null, risk: RiskTolerance | null) => void
}>) {
  const form = useFormContext<CriteriaFormValues>()
  const { errors } = form.formState
  const [name, strategy, risk] = useWatch({
    control: form.control,
    name: ["name", "strategy", "risk"],
  })
  const anchor = useComboboxAnchor()

  return (
    <FieldGroup>
      <Field data-invalid={!!errors.name}>
        <FieldLabel htmlFor="task-name">Task name</FieldLabel>
        <Input
          id="task-name"
          autoComplete="off"
          placeholder="e.g. Brisbane cashflow, under $750k"
          aria-invalid={!!errors.name}
          {...form.register("name")}
          // Use the controlled value from useWatch to keep the input
          // in sync with the form state while the page is reloading
          value={name}
        />
        <FieldError errors={[errors.name]} />
      </Field>

      <Controller
        control={form.control}
        name="propertyType"
        render={({ field }) => (
          <FieldSet>
            <FieldLegend variant="label">Property type</FieldLegend>
            <RadioGroup
              value={field.value ?? ""}
              onValueChange={(next) => field.onChange(next)}
              className="flex gap-6 cursor-pointer"
            >
              {HTAG_PROPERTY_TYPES.map((type) => (
                <Field key={type} orientation="horizontal" className="w-auto">
                  <RadioGroupItem value={type} id={`property-type-${type}`} />
                  <FieldLabel htmlFor={`property-type-${type}`} className="font-normal">
                    {PROPERTY_TYPE_LABELS[type]}
                  </FieldLabel>
                </Field>
              ))}
            </RadioGroup>
          </FieldSet>
        )}
      />

      <Controller
        control={form.control}
        name="states"
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor="task-states">Target states</FieldLabel>
            <Combobox
              multiple
              autoHighlight
              items={[...AU_STATES]}
              value={field.value}
              onValueChange={(value) => field.onChange(value)}
            >
              <ComboboxChips ref={anchor} className="w-full">
                <ComboboxValue>
                  {(values: string[]) => (
                    <>
                      {values.map((value) => (
                        <ComboboxChip key={value}>{value}</ComboboxChip>
                      ))}
                      <ComboboxChipsInput
                        id="task-states"
                        placeholder={values.length ? "" : "Choose states"}
                        onBlur={field.onBlur}
                      />
                    </>
                  )}
                </ComboboxValue>
              </ComboboxChips>
              <ComboboxContent anchor={anchor}>
                <ComboboxEmpty>No state matches that text.</ComboboxEmpty>
                <ComboboxList>
                  {(item: string) => (
                    <ComboboxItem key={item} value={item}>
                      {item}
                    </ComboboxItem>
                  )}
                </ComboboxList>
              </ComboboxContent>
            </Combobox>
            <FieldDescription>
              Running needs at least one. A draft can save without.
            </FieldDescription>
            <FieldError errors={[fieldState.error]} />
          </Field>
        )}
      />

      <ChoiceCards<Strategy>
        name="strategy"
        legend="Strategy"
        description="Sets the ranking weights, and a yield floor for cashflow and balanced."
        options={STRATEGIES}
        labels={STRATEGY_LABELS}
        value={strategy}
        onChange={(next) => onPresetChange(next, risk)}
      />

      <ChoiceCards<RiskTolerance>
        name="risk"
        legend="Risk tolerance"
        description="Sets the supply and data-quality limits in the next step."
        options={RISK_TOLERANCES}
        labels={RISK_LABELS}
        value={risk}
        onChange={(next) => onPresetChange(strategy, next)}
      />
    </FieldGroup>
  )
}
