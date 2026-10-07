"use client"

import { type SaveTaskFailure, saveTask } from "@/app/(app)/tasks/(overview)/actions"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  type CriteriaFormValues,
  RISK_LABELS,
  STRATEGY_LABELS,
  applyPreset,
  criteriaFormSchema,
  filtersCustomised,
  formToDraftCriteria,
  weightsCustomised,
} from "@/lib/criteria-form"
import { zodResolver } from "@hookform/resolvers/zod"
import type { RiskTolerance, Strategy } from "@my-ba/domain"
import type { ScreeningCostEstimate } from "@my-ba/shared"
import { Activity, ViewTransition, startTransition, useState, useTransition } from "react"
import { type FieldPath, FormProvider, useForm } from "react-hook-form"
import { CriteriaStep } from "./criteria-step"
import { ReviewStep } from "./review-step"
import { StrategyStep } from "./strategy-step"

const STEPS = [
  { title: "Strategy & risk", fields: ["name", "strategy", "risk", "states", "propertyType"] },
  { title: "Criteria", fields: ["filters", "highConfidenceOnly", "weights"] },
  { title: "Review", fields: [] },
] as const satisfies ReadonlyArray<{
  title: string
  fields: ReadonlyArray<FieldPath<CriteriaFormValues>>
}>

type Preset = { strategy: Strategy; risk: RiskTolerance }

interface Props {
  /** `null` creates a task; an id updates that draft. */
  taskId: string | null
  initialValues: CriteriaFormValues
  estimate: ScreeningCostEstimate | null
}

/**
 * P1-3 three-step criteria form. `initialValues` makes it serve create, edit
 * (a saved draft) and, from Phase 3, clone (AC 7: pre-filled and editable).
 *
 * Choosing strategy × risk prefills filters and weights from the preset (P1-8).
 * Switching preset after the investor has customised either asks first (AC 3).
 * "Create Task & Run Screening" stays disabled until P1-6 wires the run.
 */
export function TaskCriteriaForm({ taskId, initialValues, estimate }: Readonly<Props>) {
  const form = useForm<CriteriaFormValues>({
    resolver: zodResolver(criteriaFormSchema),
    defaultValues: initialValues,
    mode: "onTouched",
  })
  const [step, setStep] = useState(0)
  const [pendingPreset, setPendingPreset] = useState<Preset | null>(null)
  const [failure, setFailure] = useState<SaveTaskFailure | null>(null)
  const [isSaving, startSaving] = useTransition()

  const applyChosenPreset = (preset: Preset) =>
    form.reset(applyPreset(form.getValues(), preset.strategy, preset.risk), {
      keepDefaultValues: true,
    })

  const onPresetChange = (strategy: Strategy | null, risk: RiskTolerance | null) => {
    const current = form.getValues()
    if (!strategy || !risk) {
      form.setValue("strategy", strategy, { shouldDirty: true })
      form.setValue("risk", risk, { shouldDirty: true })
      return
    }
    if (strategy === current.strategy && risk === current.risk) return
    const hasEdits =
      current.strategy !== null &&
      current.risk !== null &&
      (filtersCustomised(current) || weightsCustomised(current))
    if (hasEdits) setPendingPreset({ strategy, risk })
    else applyChosenPreset({ strategy, risk })
  }

  const goTo = async (next: number) => {
    if (next > step) {
      const fields = STEPS.slice(step, next).flatMap((s) => [...s.fields])
      if (!(await form.trigger(fields, { shouldFocus: true }))) return
    }
    // A transition, so the panel's <ViewTransition> crossfades (D71); a plain
    // setState would swap the panels instantly.
    startTransition(() => setStep(next))
  }

  const onSaveDraft = form.handleSubmit((values) => {
    setFailure(null)
    startSaving(async () => {
      const result = await saveTask(taskId, {
        intent: "draft",
        name: values.name,
        criteria: formToDraftCriteria(values),
      })
      setFailure(result)
    })
  })

  return (
    <FormProvider {...form}>
      <form noValidate onSubmit={onSaveDraft} className="flex flex-col gap-6">
        {/*
          Steps are Base UI tabs (vendored shadcn `tabs`): arrow-key navigation and
          the tab/tabpanel roles come with it. Controlled, so moving forward goes
          through `goTo`, which validates the steps being left; if that fails the
          tab doesn't change.
        */}
        <Tabs value={step} onValueChange={(value) => void goTo(Number(value))} className="gap-6">
          <TabsList aria-label="Steps" className="bg-surface-inset">
            {STEPS.map((s, index) => (
              <TabsTrigger key={s.title} value={index} className="px-3 data-active:bg-surface">
                {s.title}
              </TabsTrigger>
            ))}
          </TabsList>

          {STEPS.map((s, index) => (
            <TabsContent
              key={s.title}
              value={index}
              className="rounded-2xl border border-border-panel bg-surface p-6 shadow-panel"
            >
              {/* Same place, different content: crossfade (D71). Unnamed, so there is
                  no name to collide on; Activity hiding/showing is the exit/enter. */}
              <Activity mode={index === step ? "visible" : "hidden"}>
                <ViewTransition enter="step-fade" exit="step-fade" default="none">
                  <div>
                    <h2 className="mb-5 text-section text-ink">{s.title}</h2>
                    {index === 0 ? <StrategyStep onPresetChange={onPresetChange} /> : null}
                    {index === 1 ? <CriteriaStep /> : null}
                    {index === 2 ? <ReviewStep estimate={estimate} /> : null}
                  </div>
                </ViewTransition>
              </Activity>
            </TabsContent>
          ))}
        </Tabs>

        {failure ? (
          <div role="alert" className="rounded-xl border border-neg-border bg-neg-bg px-4 py-3">
            <p className="text-body-sm text-neg">{failure.message}</p>
            {failure.issues.length ? (
              <ul className="mt-1 list-disc pl-5 font-data text-body-sm text-ink-3">
                {failure.issues.map((i) => (
                  <li key={`${i.path}:${i.message}`}>
                    {i.path ? `${i.path}: ` : ""}
                    {i.message}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-soft pt-4">
          <Button
            type="button"
            variant="outline"
            disabled={step === 0}
            onClick={() => void goTo(step - 1)}
          >
            Back
          </Button>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="outline" disabled={isSaving}>
              {isSaving ? "Saving…" : "Save as Draft"}
            </Button>
            {step < 2 ? (
              <Button type="button" onClick={() => void goTo(step + 1)}>
                Next
              </Button>
            ) : (
              <Tooltip>
                <TooltipTrigger render={<Button type="button" disabled focusableWhenDisabled />}>
                  Create Task &amp; Run Screening
                </TooltipTrigger>
                <TooltipContent side="top">Screening runs arrive in P1-6.</TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>
      </form>

      <Dialog
        open={pendingPreset !== null}
        onOpenChange={(open) => {
          if (!open) setPendingPreset(null)
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Replace your edits?</DialogTitle>
            <DialogDescription>
              {pendingPreset
                ? `Switching to ${STRATEGY_LABELS[pendingPreset.strategy].label} × ${RISK_LABELS[pendingPreset.risk].label} resets the filters and ranking weights to that preset. Your task name, states and price band are kept.`
                : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Keep my edits</DialogClose>
            <Button
              onClick={() => {
                if (pendingPreset) applyChosenPreset(pendingPreset)
                setPendingPreset(null)
              }}
            >
              Switch preset
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </FormProvider>
  )
}
