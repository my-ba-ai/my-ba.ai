"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import * as React from "react"
import { Controller, useForm } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"

export const smokeFormSchema = z.object({
  taskName: z.string().trim().min(3, "Name needs at least 3 characters."),
  strategy: z.enum(["growth", "yield", "balanced"], { message: "Choose a strategy." }),
  maxBudget: z
    .number({ message: "Enter a budget in whole dollars." })
    .int("Enter a budget in whole dollars.")
    .min(300_000, "Budget floor is $300,000.")
    .max(5_000_000, "Budget ceiling is $5,000,000."),
  // The message on z.boolean() covers `undefined` (an untouched checkbox), which
  // fails the type check before .refine() ever runs.
  acknowledged: z
    .boolean({ message: "Confirm before continuing." })
    .refine((value) => value, "Confirm before continuing."),
})

export type SmokeFormValues = z.infer<typeof smokeFormSchema>

const STRATEGIES: { value: SmokeFormValues["strategy"]; label: string }[] = [
  { value: "growth", label: "Capital growth" },
  { value: "yield", label: "Rental yield" },
  { value: "balanced", label: "Balanced" },
]

type SmokeFormProps = {
  defaultValues?: Partial<SmokeFormValues>
  onParsed?: (values: SmokeFormValues) => void
}

/**
 * P0-5.5 smoke test: react-hook-form + zodResolver through the shadcn `field`
 * primitives (the Base UI registry ships `field`, not `form`). Errors render
 * inline per design-system.md §4: red field messages, a red status line in the
 * action bar, and the primary disabled until the form passes again.
 */
export function SmokeForm({ defaultValues, onParsed }: SmokeFormProps) {
  const [parsed, setParsed] = React.useState<SmokeFormValues | null>(null)
  const form = useForm<SmokeFormValues>({
    resolver: zodResolver(smokeFormSchema),
    mode: "onTouched",
    // Controlled inputs need a defined starting value; strategy and maxBudget
    // stay undefined on purpose so the empty state is a real validation failure.
    defaultValues: { taskName: "", acknowledged: false, ...defaultValues },
  })
  const { errors, isSubmitted, isValid } = form.formState
  const errorCount = Object.keys(errors).length

  const onSubmit = form.handleSubmit((values) => {
    setParsed(values)
    onParsed?.(values)
    toast.success("Parsed through the schema", { description: "Nothing was saved." })
  })

  return (
    <form noValidate onSubmit={onSubmit} className="flex flex-col gap-6">
      <FieldGroup>
        <Field data-invalid={!!errors.taskName}>
          <FieldLabel htmlFor="smoke-task-name">Task name</FieldLabel>
          <Input
            id="smoke-task-name"
            autoComplete="off"
            aria-invalid={!!errors.taskName}
            {...form.register("taskName")}
          />
          <FieldError errors={[errors.taskName]} />
        </Field>

        <Controller
          control={form.control}
          name="strategy"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="smoke-strategy">Strategy</FieldLabel>
              <Select
                items={STRATEGIES}
                value={field.value ?? null}
                onValueChange={(value) => field.onChange(value)}
              >
                <SelectTrigger
                  id="smoke-strategy"
                  className="w-full"
                  aria-invalid={fieldState.invalid}
                  onBlur={field.onBlur}
                >
                  <SelectValue placeholder="Choose a strategy" />
                </SelectTrigger>
                <SelectContent>
                  {STRATEGIES.map((strategy) => (
                    <SelectItem key={strategy.value} value={strategy.value}>
                      {strategy.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />

        <Field data-invalid={!!errors.maxBudget}>
          <FieldLabel htmlFor="smoke-max-budget">Maximum budget (AUD)</FieldLabel>
          <Input
            id="smoke-max-budget"
            type="number"
            inputMode="numeric"
            step={1000}
            className="font-data"
            aria-invalid={!!errors.maxBudget}
            {...form.register("maxBudget", { valueAsNumber: true })}
          />
          <FieldError errors={[errors.maxBudget]} />
        </Field>

        <Controller
          control={form.control}
          name="acknowledged"
          render={({ field, fieldState }) => (
            <Field orientation="horizontal" data-invalid={fieldState.invalid}>
              <Checkbox
                id="smoke-acknowledged"
                checked={field.value ?? false}
                onCheckedChange={(checked) => field.onChange(checked)}
                aria-invalid={fieldState.invalid}
              />
              <FieldLabel htmlFor="smoke-acknowledged">
                I understand this form saves nothing.
              </FieldLabel>
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
      </FieldGroup>

      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border-soft pt-4">
        <output className={cn("block text-body-sm", errorCount ? "text-neg" : "text-ink-muted")}>
          {errorCount
            ? `${errorCount} ${errorCount === 1 ? "field needs" : "fields need"} attention. Nothing is parsed until ${errorCount === 1 ? "it passes" : "they pass"}.`
            : "Parsing runs the values through the Zod schema. Nothing is saved or sent."}
        </output>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              form.reset()
              setParsed(null)
            }}
          >
            Reset
          </Button>
          <Button type="submit" disabled={isSubmitted && !isValid}>
            Parse
          </Button>
        </div>
      </div>

      {parsed ? (
        <pre className="overflow-x-auto rounded-lg border border-border-card bg-surface-sunk p-3.5 font-mono text-value text-ink-3">
          {JSON.stringify(parsed, null, 2)}
        </pre>
      ) : null}
    </form>
  )
}
