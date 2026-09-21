import type { Metadata } from "next"
import { GallerySection } from "./_components/gallery-section"
import { SUBURB_ROWS } from "./_components/fixtures"
import { Primitives } from "./_components/primitives"
import { SmokeForm } from "./_components/smoke-form"
import { SpikeDialog } from "./_components/spike-dialog"
import { SuburbRows } from "./_components/suburb-rows"

export const metadata: Metadata = {
  title: "UI foundation · dev",
}

/**
 * D52's gate. Passed 8/8 by keyboard on 2026-09-21, which locked D52. Keep it
 * as a regression checklist: re-run it after any @base-ui/react upgrade. jsdom
 * can't see portal focus or blur-on-close, which is why it's manual.
 */
const SPIKE_CHECKS = [
  "Opening the dialog moves focus inside it; Tab and Shift+Tab stay inside.",
  "Slider: each thumb takes focus. Arrow keys move $25,000, Home/End jump to the limits, and the thumbs can't cross.",
  "Combobox: typing filters the 50 options. Arrow keys move the highlight, Enter adds a chip and leaves the popup open.",
  "Combobox: Backspace in an empty input removes the last chip.",
  "Escape with the popup open closes only the popup. A second Escape closes the dialog.",
  "Clicking elsewhere inside the dialog closes the popup and leaves the dialog open.",
  "The popup isn't clipped by the dialog and scrolls through all 50 options.",
  "Closing the dialog puts focus back on the trigger.",
]

export default function DevUiPage() {
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-10 sm:px-6">
      <header>
        <p className="font-data text-micro-lg text-ink-dim uppercase">
          Dev · P0-5.5 · 404s in production
        </p>
        <h1 className="mt-1 text-headline text-ink">UI foundation</h1>
        <p className="mt-2 max-w-[64ch] text-body text-ink-muted">
          Every vendored primitive on the design-system tokens, the D52 Base UI spike, the RHF + Zod
          smoke form, and a TanStack card-row table. All data on this page is fixture data.
        </p>
      </header>

      <GallerySection
        id="spike"
        label="D52 spike"
        title="Combobox and range slider inside a Dialog"
        description="If any check fails, pull that one component from the React Aria base (shadcn -b aria) and leave the rest alone."
        className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]"
      >
        <SpikeDialog />
        <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-body-sm text-ink-2 marker:font-data marker:text-ink-dim">
          {SPIKE_CHECKS.map((check) => (
            <li key={check}>{check}</li>
          ))}
        </ol>
      </GallerySection>

      <GallerySection
        id="form"
        label="Forms"
        title="react-hook-form + Zod smoke test"
        description="Submit it empty to see the §4 validation pattern, then fill it in to see the parsed output."
      >
        <SmokeForm />
      </GallerySection>

      <GallerySection
        id="table"
        label="Data rows"
        title="TanStack Table on card rows"
        description="Headless sorting under §4 card-row markup. Click a column heading to sort, or a row to open the drawer."
      >
        <SuburbRows rows={SUBURB_ROWS} />
      </GallerySection>

      <GallerySection
        id="primitives"
        label="Primitives"
        title="Vendored components"
        description="Stock shadcn variants on the remapped tokens. Styling specific to the design system gets built on top of these in P0-6."
      >
        <Primitives />
      </GallerySection>
    </main>
  )
}
