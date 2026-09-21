"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
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
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Slider } from "@/components/ui/slider"
import { SUBURB_OPTIONS, formatAud } from "./fixtures"

const BUDGET_MIN = 400_000
const BUDGET_MAX = 2_000_000
const BUDGET_STEP = 25_000

/**
 * The D52 spike: the two Base UI components most likely to misbehave inside a
 * modal. A dual-thumb range slider, and a 50-option multi-select combobox whose
 * popup portals out of the dialog. See the checklist beside it on /dev/ui.
 */
export function SpikeDialog() {
  const [open, setOpen] = React.useState(false)
  const [budget, setBudget] = React.useState<number[]>([650_000, 950_000])
  const [suburbs, setSuburbs] = React.useState<string[]>(["Maitland", "Penrith"])
  const anchor = useComboboxAnchor()

  const [low = BUDGET_MIN, high = BUDGET_MAX] = budget

  return (
    <div className="flex flex-col gap-4">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger render={<Button className="w-fit" />}>Edit search criteria</DialogTrigger>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Search criteria</DialogTitle>
            <DialogDescription>
              Changes here only affect this gallery. Nothing is saved or sent.
            </DialogDescription>
          </DialogHeader>

          <Field>
            <FieldLabel id="spike-budget-label">Budget range</FieldLabel>
            <Slider
              aria-labelledby="spike-budget-label"
              value={budget}
              onValueChange={(value) => setBudget(typeof value === "number" ? [value] : [...value])}
              min={BUDGET_MIN}
              max={BUDGET_MAX}
              step={BUDGET_STEP}
              minStepsBetweenValues={1}
            />
            <FieldDescription className="font-data text-value text-ink-3">
              {formatAud(low)} – {formatAud(high)}
            </FieldDescription>
          </Field>

          <Field>
            <FieldLabel htmlFor="spike-suburbs">Suburbs</FieldLabel>
            <Combobox
              multiple
              autoHighlight
              items={SUBURB_OPTIONS}
              value={suburbs}
              onValueChange={(value) => setSuburbs(value)}
            >
              <ComboboxChips ref={anchor} className="w-full">
                <ComboboxValue>
                  {(values: string[]) => (
                    <>
                      {values.map((value) => (
                        <ComboboxChip key={value}>{value}</ComboboxChip>
                      ))}
                      <ComboboxChipsInput id="spike-suburbs" placeholder="Type to filter" />
                    </>
                  )}
                </ComboboxValue>
              </ComboboxChips>
              <ComboboxContent anchor={anchor}>
                <ComboboxEmpty>No suburb matches that text.</ComboboxEmpty>
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
              <span className="font-data text-ink-3">{suburbs.length}</span> of{" "}
              <span className="font-data text-ink-3">{SUBURB_OPTIONS.length}</span> selected.
            </FieldDescription>
          </Field>

          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button onClick={() => setOpen(false)}>Apply</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-body-sm">
        <dt className="font-data text-micro-lg text-ink-dim uppercase">Budget</dt>
        <dd className="font-data text-value text-ink-3">
          {formatAud(low)} – {formatAud(high)}
        </dd>
        <dt className="font-data text-micro-lg text-ink-dim uppercase">Suburbs</dt>
        <dd className="text-ink-3">{suburbs.length ? suburbs.join(", ") : "None"}</dd>
      </dl>
    </div>
  )
}
