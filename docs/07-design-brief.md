# 07 — Design Brief & Prototype Prompts

Use these in **Claude Design**. Run the design system prompt first; every screen prompt assumes its tokens. After each screen, ask for the empty, loading, error, validation and permission-denied states — the happy path always looks fine, the edges are where designs break.

## Design direction

- **Primary audience:** property investors, 30–60, financially literate, time-poor
- **Secondary:** real estate agents, professional, mobile-first
- **Tone:** professional, data-dense, trustworthy. Bloomberg terminal meets modern SaaS. Not playful, not corporate-sterile.
- **Colour:** deep teal or navy primary; warm amber accent for CTAs; 6-step neutral grey scale for tables; semantic green/red/amber/blue for trend and status
- **Type:** sans-serif UI (Inter or similar); tabular numerals everywhere numbers appear; monospace for suburb codes, postcodes, license numbers
- **Scope:** light mode only for MVP

## Component inventory

Button (primary/secondary/ghost/destructive, sm/md/lg) · Input, Select, MultiSelect, RangeSlider · Card with header action slot · DataTable (sortable, filterable, paginated, density toggle) · Badge (pending, approved, rejected, locked, running) · Modal/Drawer · Toast · ProgressStepper (horizontal, task stages) · EmptyState · SkeletonLoader

Deliverable from the design system pass: colour tokens, 6-step type scale, 4px spacing scale, component specs with all states, and one assembled example screen.

---

## Screens to prototype

### P0 — Foundation

**Task List.** Left sidebar nav (Tasks, Agents, Reports, Settings). Header with "+ New Purchase Task". Task rows as cards: name, colour-coded status badge, compact progress stepper, shortlist count, criteria summary, last-updated, overflow menu (Clone / Archive / Delete). Filter tabs (All / Active / Drafts / Closed), sort dropdown. States: empty (with a 3-step explanation of the workflow), populated, loading skeleton.

**Auth.** Sign in, sign up, magic-link-sent. Desktop split layout: narrow form left (max 400px), marketing panel right with tagline and three value props over an abstract data-viz background. Mobile collapses to form only.

**Dev HITL console** (internal, not user-facing, deliberately unstyled). Three panels: run state (run ID, thread ID, current node, status badge, last checkpoint); interrupt payload as raw JSON plus key-value tree; approval actions (Approve & Resume, Reject & Abort, Edit Payload). Run log below, expandable per node. Monospace, dark mode.

### P1 — Screening

**Create Purchase Task.** Three steps with a progress indicator.

1. Basics — task name, target states (multi-select), property type, budget dual-handle range slider
2. Criteria — grid of toggleable inputs (vacancy rate max, stock on market max, renter proportion min, demand-to-supply min, median yield min, days on market max), each with label, control and helper text
   _Superseded in P1-3 (D43, D68, D69): no renter-proportion or demand-to-supply filters (renter share is a ranking factor; DSR is proprietary). The budget slider is the typical-price range in this step, and step 1 is strategy & risk. See roadmap P1-3._
3. Review — criteria summary card, estimated runtime, "Create Task & Run Screening" / "Save as Draft"

Validation: at least one state, at least three criteria enabled. Steps 1 and 3 must fit a 13" laptop without scrolling.

**Task Detail — screening in progress.** Breadcrumb, editable task name, status badge, horizontal stage stepper. 70/30 split: left is live progress (status message, progress bar, "Processed 3,241 / 7,128 suburbs", auto-scrolling terminal-styled log, ETA); right is task summary (criteria, states, budget, created, Edit Criteria disabled with tooltip while running). States: 0%, mid-run, 95%, failed with retry.

**HITL Approval Gate — screening results.** The highest-leverage screen in the product. Dedicated page, not a modal. Header states what completed and what approving triggers. Ranked suburb table: rank, suburb + state, postcode, score with colour bar, vacancy, renter proportion, demand-to-supply, yield, days on market, view/exclude actions. Search, select-all, bulk exclude, CSV export, pagination, density toggle. Summary stats and filter chips above. Sticky bottom bar: selected count, "Adjust Criteria & Re-run" secondary, "Approve & Continue to Trend Analysis" primary. Row hover shows a sparkline preview.

**Suburb Detail Drawer.** 480px right drawer. Header with name, state, postcode, score badge. Six metric cards each with value, 12-month trend indicator and sparkline. Score breakdown as a horizontal bar chart showing each component's contribution. 12-month line chart with metric toggle. Notes textarea saved to the task. Sticky footer: exclude / keep.

**Generic "Awaiting Approval" state.** One reusable layout serving every stage gate. Centred card, max 800px: stage badge ("Stage 1 of 3"), headline result, mini preview table of the top 5 with "view all", a "what happens next" section explaining the next stage and its estimated time, sticky action bar with Reject & Adjust / Approve & Continue. Sidebar shows the task summary and a link to the full run log. Same layout must work for Trend and Growth stages with only copy and preview content swapped.

**Run Log viewer.** Left sidebar lists stages with status and duration. Main area is a chronological card list: timestamp, duration, agent name and action, collapsible input and output summaries, tool calls made, agent reasoning text, token usage and cost, status icon. Expandable to full JSON. Filters: all / errors only / tool calls only. Export as JSON. Terminal-inspired but readable; density is fine, this is a power-user surface.

---

## Design risk worth extra iteration

The approval gate carries the whole product. If I don't trust or understand what the system is asking me to approve, the workflow collapses back to manual and the product has no reason to exist. Budget disproportionate design time there — specifically on making the _score breakdown_ legible, since that's the thing that earns or loses trust.
