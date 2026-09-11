# Property Screening Platform — Design System v1

Locked from `Approval Gate & Suburb Drawer v3 Light`. Light mode only. Bloomberg-terminal density with a modern, AI-native surface: white panels, teal→indigo accent, monospace for every number.

---

## 1. Colour tokens

```css
:root {
  /* Canvas & surfaces */
  --canvas:        #F1F4FA;  /* page background */
  --surface:       #FFFFFF;  /* panels, cards, drawer */
  --surface-sunk:  #FAFBFD;  /* stat tiles, sidebar, metric cards */
  --surface-inset: #F2F5F9;  /* segmented control track */

  /* Borders */
  --border:        #E2E8F1;  /* panel outline */
  --border-soft:   #EDF1F6;  /* internal dividers */
  --border-card:   #E6EBF3;  /* card / row outline */
  --border-strong: #D5DEEA;  /* inputs, secondary buttons */

  /* Ink */
  --ink:           #101B2D;  /* primary text, headings, key numbers */
  --ink-2:         #2C3A4F;  /* body copy in tinted blocks */
  --ink-3:         #33415A;  /* table values */
  --ink-muted:     #5B6B82;  /* secondary text, section labels */
  --ink-dim:       #6C7C93;  /* mono micro-labels (min size 10px) */

  /* Accent */
  --accent:        #0EA5A0;  /* teal — primary interactive */
  --accent-deep:   #0B7F7B;  /* teal text on white (AA) */
  --accent-alt:    #5B5BD6;  /* indigo — secondary/agent */
  --accent-alt-deep:#4F46E5; /* indigo text on white (AA) */
  --accent-grad:   linear-gradient(135deg, #0EA5A0, #5B5BD6);
  --accent-grad-cta: linear-gradient(135deg, #0EA5A0, #2D8FD6);

  /* Semantic */
  --pos:           #15803D;
  --neg:           #C42B2B;
  --neg-bg:        #FDF2F2;
  --neg-border:    #F6C9C9;
  --warn:          #96560A;
  --warn-border:   #EBCB94;

  /* Score-breakdown ramp (6 criteria, teal→indigo) */
  --seg-1: #0EA5A0; --seg-2: #128FB4; --seg-3: #2D7FD0;
  --seg-4: #4A6FDD; --seg-5: #5B5BD6; --seg-6: #7B5BD0;
}
```

Rules: one accent gradient per screen, used on the primary CTA and at most one identity mark. Never use gradient for body text except a single headline number. Semantic colours never carry meaning alone — always paired with a label.

---

## 2. Type

- **UI / headings:** Space Grotesk — 400, 500, 600.
- **Numbers, codes, system labels:** JetBrains Mono — 400, 500, 600. Always `font-variant-numeric: tabular-nums`.
- Monospace is mandatory for: all metric values, scores, postcodes, SA2 codes, run IDs, timestamps, token/cost figures, and uppercase micro-labels.

| Role | Font | Size | Weight | Notes |
|---|---|---|---|---|
| Page headline | Space Grotesk | 32px | 600 | `letter-spacing:-0.02em`, line-height 1.18 |
| Section heading | Space Grotesk | 23px | 600 | drawer/state headings |
| Card title | Space Grotesk | 14px | 600 | |
| Body | Space Grotesk | 14–14.5px | 400 | line-height 1.6, max 64ch |
| Secondary body | Space Grotesk | 12.5px | 400 | line-height 1.55 |
| Table value | JetBrains Mono | 13–13.5px | 500–600 | |
| Metric value | JetBrains Mono | 18–21px | 600 | |
| Micro-label | JetBrains Mono | 10–10.5px | 500 | uppercase, `letter-spacing:0.09em`, colour `--ink-dim` |

Minimum text size 10px, and only for uppercase mono labels. Body never below 12.5px.

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
- Empty: state *why* nothing matched, with the binding constraint and a quantified suggestion.
- Error: name the failing node in mono, state that nothing was written or approved, show the raw error line, offer log + retry.
- Loading: shimmer skeletons matching the real layout, plus a mono progress line.
- Validation: inline in the action bar, red, primary disabled.
- Permission denied: amber LOCKED chip naming who *can* act.

---

## 5. Motion

`pulse` 1.6–1.8s on live/next indicators · `shim` 1.25s skeleton shimmer · `drift` 14s ambient background glow · `slidein` .22s drawer · 160–180ms ease on hover states. Nothing else animates.

---

## 6. Voice

Plain, factual, quantified. State what a control will do before it is pressed ("Approving locks this shortlist and starts trend analysis"). Explicitly state what will *not* happen ("Nothing is bought, offered on, or committed"). No exclamation, no encouragement, no hedging.

---

## How to load this into a Claude Project

1. In your Claude Project, open **Project knowledge** and upload this file (`design-system.md`).
2. Also upload `Approval Gate & Suburb Drawer v3 Light.dc.html` as the reference implementation — it is a single self-contained file and is the source of truth for anything this document leaves ambiguous.
3. Add to the Project's **custom instructions**:
   > All UI follows `design-system.md`. Use only its tokens, type scale and components. Match the patterns in the reference implementation. Every screen ships empty, loading, error, validation and permission-denied states. Light mode only.
4. For a codebase, paste section 1 into your global stylesheet as-is and map the component specs to your framework's primitives.
