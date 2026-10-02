# Property Screening Platform — Design System v1

Locked from `Approval Gate & Suburb Drawer v3 Light`. Light mode only. Bloomberg-terminal density with a modern, AI-native surface: white panels, teal→indigo accent, tabular figures for every number.

---

## 1. Colour tokens

```css
:root {
  /* Canvas & surfaces */
  --canvas: #f1f4fa; /* page background */
  --surface: #ffffff; /* panels, cards, drawer */
  --surface-sunk: #fafbfd; /* stat tiles, sidebar, metric cards */
  --surface-inset: #f2f5f9; /* segmented control track */

  /* Borders */
  --border: #e2e8f1; /* panel outline */
  --border-soft: #edf1f6; /* internal dividers */
  --border-card: #e6ebf3; /* card / row outline */
  --border-strong: #d5deea; /* inputs, secondary buttons */

  /* Ink */
  --ink: #101b2d; /* primary text, headings, key numbers */
  --ink-2: #2c3a4f; /* body copy in tinted blocks */
  --ink-3: #33415a; /* table values */
  --ink-muted: #5b6b82; /* secondary text, section labels */
  --ink-dim: #6c7c93; /* mono micro-labels (min size 10px) */

  /* Accent */
  --accent: #0ea5a0; /* teal — primary interactive */
  --accent-deep: #0b7f7b; /* teal text on white (AA) */
  --accent-alt: #5b5bd6; /* indigo — secondary/agent */
  --accent-alt-deep: #4f46e5; /* indigo text on white (AA) */
  --accent-grad: linear-gradient(135deg, #0ea5a0, #5b5bd6);
  --accent-grad-cta: linear-gradient(135deg, #0ea5a0, #2d8fd6);

  /* Semantic */
  --pos: #15803d;
  --neg: #c42b2b;
  --neg-bg: #fdf2f2;
  --neg-border: #f6c9c9;
  --warn: #96560a;
  --warn-border: #ebcb94;

  /* Score-breakdown ramp (6 criteria, teal→indigo) */
  --seg-1: #0ea5a0;
  --seg-2: #128fb4;
  --seg-3: #2d7fd0;
  --seg-4: #4a6fdd;
  --seg-5: #5b5bd6;
  --seg-6: #7b5bd0;
}
```

Rules: one accent gradient per screen, used on the primary CTA and at most one identity mark. Never use gradient for body text except a single headline number. Semantic colours never carry meaning alone — always paired with a label.

---

## 2. Type

- **One family: Manrope** — 400, 500, 600 (D55; replaced Space Grotesk + JetBrains Mono on 2026-09-21. Lato was tried and reverted the same day, D56).
- **Data text** (utility `font-data`): Manrope with `font-variant-numeric: tabular-nums`, always. Tabular figures are mandatory for: all metric values, scores, postcodes, SA2 codes, run IDs, timestamps, token/cost figures, and uppercase micro-labels.
- **Raw machine output** (utility `font-mono`): the OS monospace stack, no webfont. Only for JSON payloads, raw error lines and log excerpts.

| Role            | Font           | Size      | Weight  | Notes                                                  |
| --------------- | -------------- | --------- | ------- | ------------------------------------------------------ |
| Page headline   | Manrope        | 32px      | 600     | `letter-spacing:-0.02em`, line-height 1.18             |
| Section heading | Manrope        | 23px      | 600     | drawer/state headings                                  |
| Card title      | Manrope        | 14px      | 600     |                                                        |
| Body            | Manrope        | 14–14.5px | 400     | line-height 1.6, max 64ch                              |
| Secondary body  | Manrope        | 12.5px    | 400     | line-height 1.55                                       |
| Table value     | Manrope (data) | 13–13.5px | 500–600 |                                                        |
| Metric value    | Manrope (data) | 18–21px   | 600     |                                                        |
| Micro-label     | Manrope (data) | 10–10.5px | 500     | uppercase, `letter-spacing:0.09em`, colour `--ink-dim` |

Minimum text size 10px, and only for uppercase data labels. Body never below 12.5px.

---

## 3. Spacing, radius, elevation

- 4px base scale: 4 · 6 · 8 · 10 · 12 · 14 · 18 · 20 · 22 · 26 · 30.
- Radius: `18px` panels/drawer · `13–14px` cards and rows · `10px` buttons · `9px` small controls · `999px` status pills.
- Elevation: panels `0 40px 80px -48px rgba(16,27,45,.35)`; hover lift `translateY(-2px)` + `0 12px 26px -20px rgba(16,27,45,.5)`; CTA glow `0 10px 24px -14px rgba(14,165,160,.9)`.
- Sticky bars use `rgba(255,255,255,.9)` + `backdrop-filter: blur(14px)`.

---

## 4. Components

**Button** — `10px` radius, `11px 20px` (md).

- Primary: `--accent-grad`, white text, CTA glow.
- Secondary: white, `1px solid --border-strong`, `--ink-3`; hover borders to `--accent-alt`.
- Disabled: `#EDF1F6` bg, `#98A5B7` text, `cursor:not-allowed`.

**Status pill** — 999px radius, 1px tinted border, 6px dot, mono uppercase 10.5px. Active/next stage dot uses the `pulse` animation.

**Stat tile** — `--surface-sunk`, `--border-card`, mono micro-label over a 21px mono value, hover lift.

**Data row (card table)** — grid row in a white card, `--border-card`, 11px/14px padding, 7px gap between rows. Hover: tint `#F8FAFD`, teal border, 1px lift, teal-tinted shadow. Rows are clickable and open the detail drawer.

**Agent rationale block** — tinted gradient panel (`rgba(14,165,160,.07)` → `rgba(99,102,241,.06)`), teal mono label "AGENT RATIONALE", model/token/cost line, then plain-language prose explaining what the agent concluded and why. Use this anywhere the system asks a human to accept a machine judgement.

**Score ring** — 64px SVG ring, `stroke-width 6`, teal arc on `#EBEFF5` track, rotated -90°. The number is an HTML overlay (SVG `<text>` does not render reliably in this stack), mono 19px.

**Score breakdown** — a stacked composite bar (one segment per criterion, flex-weighted by points earned, ramp colours), then one row per criterion: swatch + label, mono "actual vs threshold" on the right, and a bar whose **length is the criterion's weight** and whose **fill is the points earned**. Ends with a Composite total row. No criterion may exceed its own weight.

**Drawer** — 500px desktop / full-width mobile, `z-index 200` above all chrome, `slidein .22s`, dimmed blurred overlay that closes on click. Structure: header (rank, name, codes, score ring, close) → scroll body → sticky footer with destructive-secondary + primary actions.

**Sticky action bar** — status text on the left (kept/excluded counts, or the validation/permission message), secondary then primary on the right.

**Empty / Error / Loading / Validation / Permission-denied** — every screen ships all five.

- Empty: state _why_ nothing matched, with the binding constraint and a quantified suggestion.
- Error: name the failing node in mono, state that nothing was written or approved, show the raw error line, offer log + retry.
- Loading: shimmer skeletons matching the real layout, plus a mono progress line.
- Validation: inline in the action bar, red, primary disabled.
- Permission denied: amber LOCKED chip naming who _can_ act.

---

## 5. Motion

`pulse` 1.6–1.8s on live/next indicators · `shim` 1.25s skeleton shimmer · `drift` 14s ambient background glow · `slidein` .22s drawer · 160–180ms ease on hover states. Nothing else animates.

**View transitions (D71).** Navigation and step changes, via React `<ViewTransition>`:

- **Directional page slide:** 24px. The old page fades out over 120ms, then the new one fades in over 180ms; both slide over 220ms. Forward (deeper: list → task → edit) slides left; back (breadcrumb ancestors) slides right. The shell (sidebar, mobile bar) never moves.
- **Shared element:** a task's title morphs from its list card into the detail heading over 220ms, with a 3px mid-flight blur.
- **Same-place crossfade:** 180ms, between the criteria form's steps.
- **Reduced motion:** with `prefers-reduced-motion: reduce`, durations drop to 0 and content swaps instantly.

---

## 6. Voice

Plain, factual, quantified. State what a control will do before it is pressed ("Approving locks this shortlist and starts trend analysis"). Explicitly state what will _not_ happen ("Nothing is bought, offered on, or committed"). No exclamation, no encouragement, no hedging.

---

## How to load this into a Claude Project

1. In your Claude Project, open **Project knowledge** and upload this file (`design-system.md`).
2. Also upload `Approval Gate & Suburb Drawer v3 Light.dc.html` as the reference implementation — it is a single self-contained file and is the source of truth for anything this document leaves ambiguous.
3. Add to the Project's **custom instructions**:
   > All UI follows `design-system.md`. Use only its tokens, type scale and components. Match the patterns in the reference implementation. Every screen ships empty, loading, error, validation and permission-denied states. Light mode only.
4. For a codebase, paste section 1 into your global stylesheet as-is and map the component specs to your framework's primitives.
