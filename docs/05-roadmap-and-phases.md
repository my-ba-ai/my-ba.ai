# 05 — Roadmap & Phases

## MVP boundary

**In:** Purchase Task creation with investor profile (strategy × risk) and criteria UI · Suburb Screener via HtAG server-side query + our own strategy-weighted ranking · Trend Analyser · Growth Potential Analyser · HITL gates at every stage · run log with per-step HtAG cost · report web view with HtAG attribution · data locking · task cloning · Agent Discovery (registered agents only, agency grouping visible) · agent registration with manual verification · platform-sent outreach email · email notifications on gates

**Out (post-MVP):** chat/messaging · PDF export · payment integration · off-market listings · automated license verification · Property Scout listings integration (see note in Phase 4) · sponsored placement (D12/D13) · reusable investor profiles (D18) · preset back-test calibration (D17) · HtAG Agent API narratives (D41)

---

## Phase 0 — Foundation (Week 1)

**Goal:** skeleton monorepo, auth working, DB migrated, empty task list rendering, and the orchestration risk retired.

| Ticket   | Description                 | Acceptance criteria                                                                                                                                                                                                                                                                                                                                                                                               |
| -------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0-1     | Monorepo scaffold           | Turborepo + pnpm workspace with `apps/api` (NestJS), `apps/web` (Next.js), `apps/worker`, `packages/shared` (types, constants, Zod schemas). Shared tsconfig, lint, CI.                                                                                                                                                                                                                                           |
| P0-2     | Database setup              | Postgres with TimescaleDB + pgvector enabled. Schema for `Users`, `Tenants`, `PurchaseTasks`, `Suburbs`. Migrations run on startup. `tenant_id` present everywhere.                                                                                                                                                                                                                                               |
| P0-3     | Auth integration            | Clerk or Supabase Auth. JWT middleware in NestJS. Tenant resolution from the token. RLS policies applied.                                                                                                                                                                                                                                                                                                         |
| P0-4     | Redis + BullMQ wiring       | Redis in `docker-compose` (`noeviction`, AOF). `@nestjs/bullmq` registered in API (producer) and worker (consumer). `diagnostics` queue: authenticated `POST /api/diagnostics/jobs` enqueues a tenant-stamped payload (D49), worker `@Processor` parses and logs it. Bull Board at `/api/admin/queues` behind basic auth, dev only (D48). `GET /api/health/redis`. Identity cache moved to Redis (D50). **Done.** |
| **P0-5** | **LangGraph.js HITL spike** | **Riskiest ticket — do this first.** Minimal graph, 3 nodes, one `interrupt()`. Postgres checkpointer via `PostgresSaver`. Verify: run pauses, thread status is `interrupted`, process can restart while paused, resume command continues from checkpoint, state survives.                                                                                                                                        |
| P0-6     | Next.js shell               | Auth-gated routes, nav layout, empty task list, placeholder task detail.                                                                                                                                                                                                                                                                                                                                          |

**Deliverable:** I can log in, see an empty task list, and pause/resume is proven end-to-end.

**Gate:** if P0-5 fails, stop and redesign the orchestrator before Phase 1.

---

## Phase 1 — HtAG Integration + Suburb Screener (Weeks 2–3)

**Goal:** create a task with an investor profile and criteria → HtAG server-side screen → our strategy-weighted ranking → HITL approval gate. Per-task HtAG spend ≤ AUD $20 (D16).

Governing decisions: D16–D19, D37–D44.

### P1-0 — Schema delta for HtAG data shape

**Description:** Drizzle schema change + generated migration (no hand-written DDL).

- `SuburbMetricsTS`: time column holds HtAG `period_end` (rename to `measured_at` if P0-2 named it `timestamp`); add `property_type text not null` (check `'house' | 'unit'`), `bedrooms text not null default 'All'`, `confidence text null`, `source text not null default 'htag'`; unique index `(suburb_id, property_type, bedrooms, metric_name, measured_at)`.
- `Suburbs`: add `htag_area_id text unique` (HtAG `loc_pid`, e.g. `QLD2659`), `abs_sal_code text null`.
- New `htag_calls`: `id, tenant_id, task_id null, analysis_step_id null, endpoint, request_json, rows_returned, tier, cost_aud numeric(10,4), status_code, created_at`.
- `ScreeningResults.score_breakdown_json` shape documented as `Ranked` (P1-8).

**Acceptance criteria:**

1. Migration generated from Drizzle schema and applies cleanly on a fresh DB and on the P0-2 DB.
2. Unique index accepted by TimescaleDB (includes time column).
3. Upserting the same `(suburb, property_type, bedrooms, metric, measured_at)` twice leaves one row.
4. RLS policies extended to `htag_calls` consistent with P0-2/P0-3 conventions.

**Dependencies:** P0-2. **Risk:** low.

### P1-1 — HtAG REST client

**Description:** `packages/htag-client`. fetch + Zod. `x-api-key` from env, server-side only (cl. 36). Methods: `queryMarkets(body)`, `trends(metric, { areaIds[], propertyTypes[], periodEndMin?, periodEndMax?, limit, offset })`, `summary(...)`. Comma-joins `area_id`; auto-paginates until page length < `limit`. Every call records an `htag_calls` row with `rows_returned` and `cost_aud` computed from tier rates in config.

**Typed errors:** `HtagBadRequestError` (400, carries `detail`), `HtagAuthError` (401), `HtagBalanceExhaustedError` (402, carries `returned`, `remaining_free`), `HtagQuotaExceededError` (429). No retry on 400/401/402/429; exponential backoff on 5xx and network errors only.

**Zod row schemas:** `HtagQueryRecord`, `HtagSummaryRow`, `HtagSomRow`, `HtagDomRow`, trend rows for price/rent/yield. All metric fields nullable. DOM `0` normalised to `null` at the boundary (Q13).

**Acceptance criteria:**

1. Contract tests run against recorded fixtures (no live key in CI).
2. Pagination test: 3 pages (100, 100, 37) returns 237 rows; stops on short page, never uses `total`.
3. Each error class raised from a fixture of the corresponding status.
4. Zod failure on one row logs and skips that row, does not throw for the batch; failure count returned.
5. `cost_aud` matches rows × configured tier rate.
6. Grep/lint check: no HtAG key referenced from `apps/web`.

**Dependencies:** P0-1, P1-0. **Risk:** low.

### P1-2 — _Retired_

Folded into P1-4 (on-demand trend hydration). The scheduled national refresh worker is no longer needed (D27 superseded by D40/D42). ID not reused.

### P1-3 — Investor profile + criteria schema + form

**Description:** `CriteriaSchema` (Zod) in `packages/shared`, saved to `purchase_tasks.criteria_json`, compiled to HtAG `logic` by pure `compileToHtagLogic`. Next.js 3-step form (React Hook Form + Zod resolver):

1. **Strategy & risk** — strategy (growth / cashflow / balanced), risk (low / medium / high), task name, target states, property type. Selecting both prefills filters and weights from the preset (P1-8).
2. **Criteria** — toggleable filters: typical price range, gross yield % range, vacancy rate % max, stock on market % max, days on market max, annual sales volume min, IRSAD decile min, high-confidence-only (default on). Collapsible "Customise ranking weights" panel (sliders, normalised to 1 on save).
3. **Review** — criteria + profile summary, preset badge (with "custom" flags), estimated HtAG cost ceiling, "Create Task & Run Screening" / "Save as Draft".

Profile block: `{ strategy, risk, presetVersion, weights, weightsCustomised, filtersCustomised }`. Percent inputs converted to fractions in `compileToHtagLogic`, not in the form.

**Acceptance criteria:**

1. `CriteriaSchema` rejects inverted ranges, empty `states`, unknown keys, and invalid weights (P1-8 `Weights`).
2. `compileToHtagLogic` snapshot-tested: every filter, percent→fraction scaling, all filters off (bedrooms + state + confidence leaves only).
3. Editing any preset-prefilled filter sets `filtersCustomised`; editing any weight sets `weightsCustomised`. Switching preset after edits requires confirmation.
4. **Before merge:** zero-cost probe of `state` field (`typical_price gte 999999999` + `state in ["QLD"]`). If rejected, record in Q16 and remove the leaf (state filtering then handled by a verified field or area-ID scoping — never by post-truncation local filtering).
5. **Before merge:** manual check of `vacancy_rate` units; record finding in PR and Q16.
6. Draft saves with partial criteria; "Run" requires full parse.
7. Clone (Phase 3) opens this form pre-filled from the source task's profile — form accepts an initial `Criteria` value.

**Dependencies:** P1-1 (types), P1-8. **Risk:** medium (unverified `state` field, vacancy units).

### P1-4 — Suburb Screener node

**Description:** LangGraph node. Steps:

1. Compile criteria → `POST /markets/query`, `limit` from config (`SCREEN_QUERY_LIMIT`, default 100).
2. If returned == limit → `interrupt({ type: 'SCREENING_TOO_BROAD', criteria, returned })`. No further calls.
3. Upsert returned areas into `Suburbs` (by `htag_area_id`).
4. Hydrate Reference-tier `trends/price` (24 points), `trends/rent` (9), `trends/yield` (1) for survivors via comma-list batches with `period_end_min`; reuse cached rows already in `SuburbMetricsTS` (D40).
5. Join ABS renter proportion (P1-10) where available.
6. Build `RawMetrics[]` → `rankSuburbs(metrics, criteria.profile.weights, { disabledFactors })` (P1-8).
7. Restricted hydration: `trends/stock-on-market`, `trends/days-on-market`, `trends/vacancy` latest period for top N (`SCREEN_RESTRICTED_TOP_N`, default 6).
8. Write `ScreeningResults` (score, `Ranked` breakdown) and `AnalysisSteps` (request bodies, rows, `costAud`, `presetVersion`, customised flags).
9. `interrupt({ type: 'SCREENING_APPROVAL', criteria, rankedSuburbs, costAud })`.

**Acceptance criteria:**

1. Returned == limit → too-broad interrupt; mocked client asserts zero trends calls.
2. Zero results → approval interrupt with empty list and `costAud` 0, not an error.
3. Cached trend rows for the current period are not re-fetched (mocked client asserts reduced `area_id` list).
4. `costAud` summed from `htag_calls` for the step; stored on `AnalysisSteps`.
5. `HtagQuotaExceededError` / `HtagBalanceExhaustedError` fail the step with a typed reason; task remains resumable after resolution.
6. `low_volatility` auto-disabled (weight redistributed) when < 18 price points available for the survivor set; recorded in `disabledFactors`.
7. Fixture run at configured tier rates costs ≤ $20. If Q13(i) resolves per-row, `SCREEN_QUERY_LIMIT` set to 80 and this test re-run.
8. Q04: dev config can restrict `states` to one state without code change.

**Dependencies:** P0-5, P1-1, P1-3, P1-8; P1-10 soft (renter factor absent → coverage renormalises). **Risk:** medium.

### P1-5 — Approval UI

**Description:** Renders both interrupt payloads.

- `SCREENING_APPROVAL`: ranked table (rank, suburb + state, score bar, yield, price momentum, rent momentum, renter share, insufficient-data badge), exclude-with-undo, criteria + profile summary with preset badge and custom flags, HtAG cost for the step, Approve & Continue / Reject & Adjust. Resumes via API endpoint.
- `SCREENING_TOO_BROAD`: explains the result hit the cap and is truncated/unordered; shows current filters with suggestions to tighten; "Adjust Criteria & Re-run" only (no approve).

**Acceptance criteria:**

1. Too-broad state offers no approve action.
2. `insufficientData` rows visually distinct and sorted last (as delivered by P1-8).
3. HtAG attribution + disclaimer present (P1-9).
4. Cost shown in AUD from `AnalysisSteps.costAud`.

**Dependencies:** P1-4, P1-9. **Risk:** low.

### P1-6 — Task state machine wiring

**Description:** Graph: `DRAFT → SCREENING → (interrupt) → TREND_ANALYSIS`. Reject & Adjust returns to `DRAFT` with criteria editable. `PurchaseTasks.status` syncs with graph state. Every node execution writes an `AnalysisSteps` row.

**Acceptance criteria:** unchanged from original, plus: `SCREENING_TOO_BROAD` resume path returns task to `DRAFT`.

**Dependencies:** P0-5, P1-4. **Risk:** medium (inherits D22).

### P1-7 — Screening results view + suburb drawer

**Description:** Sortable, filterable, paginated table with density toggle and score breakdown. Suburb detail drawer shows: our ranking factors as bars (raw value + percentile + weight + contribution from `Ranked.breakdown`); server-side filter criteria as pass chips (values not available — D42); restricted metrics if hydrated (top N); explicit "Load supply detail" button for other suburbs showing estimated cost before fetching (**provisional pending Q19**).

**Acceptance criteria:**

1. Drawer never renders a numeric value for a filter-only metric it doesn't have.
2. "Load supply detail" confirms cost, calls P1-1, persists to cache, records `htag_calls` against the task.
3. HtAG attribution present (P1-9).

**Dependencies:** P1-4, P1-9. **Risk:** low (UI shape may change with Q19).

### P1-8 — Suburb ranking module

**Description:** `packages/domain/src/ranking/` — `presets.ts` (`Strategy`, `RiskTolerance`, `FactorId`, `Weights`, `PRESET_VERSION`, `presetWeights`, preset filter defaults) and `rank.ts` (`RawMetrics`, `rankSuburbs`, `percentileRanks`). No I/O, no LLM, no HtAG proprietary scores (D39, D44). Presets per D17/D19:

| Strategy | Base weights                                                              | Filter defaults |
| -------- | ------------------------------------------------------------------------- | --------------- |
| Growth   | price_mom_6m 0.45 · rent_mom_6m 0.20 · owner_share 0.25 · yield_now 0.10  | —               |
| Cashflow | yield_now 0.50 · rent_mom_6m 0.30 · renter_share 0.15 · price_mom_6m 0.05 | yield ≥ 4.5%    |
| Balanced | yield_now 0.30 · price_mom_6m 0.30 · rent_mom_6m 0.30 · renter_share 0.10 | yield ≥ 3.5%    |

| Risk   | low_volatility weight (base scaled by 1 − w) | Filter defaults                                               |
| ------ | -------------------------------------------- | ------------------------------------------------------------- |
| Low    | 0.25                                         | confidence High · IRSAD ≥ 5 · vacancy ≤ 1.5% · sales ≥ 100/yr |
| Medium | 0.10                                         | confidence High · IRSAD ≥ 3 · vacancy ≤ 2.5% · sales ≥ 50/yr  |
| High   | 0                                            | confidence any · vacancy ≤ 4% · sales ≥ 20/yr                 |

**Acceptance criteria:**

1. `presetWeights` sums to 1 (±1e-9) for all 9 combinations; snapshot-tested.
2. `percentileRanks` handles ties (average rank), n = 1 (0.5), all-undefined.
3. Disabled factor → remaining weights renormalise; coverage not penalised.
4. Coverage < 50% → `insufficientData`, sorted below all sufficient suburbs.
5. Deterministic tie-break on `areaId`; stable output across runs.
6. `Weights` rejects `renter_share` + `owner_share` both > 0, and all-zero.
7. Test asserts `RawMetrics` contains no RCS/Dex/GRC or other HtAG-proprietary fields.

**Dependencies:** none. **Risk:** low.

### P1-9 — HtAG attribution component

**Description:** Design-system component rendering "Powered by HtAG Analytics" linked to `https://developer.htagai.com` plus the not-financial-advice disclaimer (D38). Used on every view showing HtAG-derived data.

**Acceptance criteria:**

1. Legible, not materially less prominent than surrounding content, in the same view as the data (cl. 39(c)).
2. Present on P1-5, P1-7, and the Phase 2 report view.
3. Visual regression snapshot.

**Dependencies:** P0-6. **Risk:** low.

### P1-10 — ABS tenure ETL (renter proportion)

**Description:** One-off + annual BullMQ job loading 2021 Census tenure data (renter proportion per suburb) into Postgres, joined to `Suburbs` via ABS SAL code ↔ HtAG `loc_pid` concordance. Pulled forward from Phase 2 (tenure only; rest of ABS ETL stays in Phase 2).

**Acceptance criteria:**

1. Renter proportion available for ≥ 95% of suburbs returned by a representative screen fixture.
2. Concordance source recorded. **Check before build:** which Census DataPack table holds tenure at SAL level, and whether HtAG's Concordance endpoints (Reference tier) or ABS correspondence files provide SAL ↔ `loc_pid` mapping.
3. Idempotent re-run.
4. Missing mapping → `renterProportion` undefined (P1-8 coverage handles it), not a failure.

**Dependencies:** P1-0. **Risk:** medium (SAL ↔ loc_pid mapping unverified).

**Deliverable:** create a task with a strategy and risk profile, run a screen within budget, see a ranked list explained factor by factor, get told when criteria are too broad, approve or reject, see the task advance.

---

## Phase 2 — Trend + Growth Analysers (Weeks 4–5)

- ABS census ETL worker — remaining MVP fields beyond tenure (P1-10); IRSAD comes from HtAG (D43)
- Trend Analyser agent — Reference-tier price/rent/yield history (long window), bounded restricted-tier history per Q17, stability metrics, narrative + score; HtAG spend recorded per step
- Growth Potential Analyser agent — HtAG + Domain + ABS (+ web search, pending Q07); raw HtAG endpoints only (D41)
- Autonomy config UI (per-agent-type defaults, per-run override)
- Run log viewer — each agent's inputs, outputs, tool calls, reasoning, token cost, HtAG cost
- Report web view aggregating all stage outputs; preset badge with custom flags (D19); HtAG attribution (P1-9)

**Deliverable:** full criteria → report pipeline with HITL at each stage.

---

## Phase 3 — Locking + Cloning (Week 6)

- `locked_at` + `TaskArtifacts` snapshot on CONTACT_AGENT transition; snapshot includes profile, `presetVersion`, customised flags, query logic, raw factor values (D19, D44)
- Per-field source provenance so HtAG-sourced values can be redacted (design per Q08 — decide before building)
- Immutability enforcement (artifacts can't be written post-lock)
- Clone task action — copies criteria + investor profile; opens P1-3 form pre-filled and editable before run (D18)
- Task version/lineage display (`cloned_from_task_id`)

---

## Phase 4 — Agent Discovery + Registration (Weeks 7–8)

**Before starting:** resolve Q10 (tenancy model) and Q11 (`user_roles` / `task_participants`).

- RateMyAgent scrape via Apify actor → `ScrapedAgents` + `Agencies`
- Agent ranking module (pure function, unit tested against D31 weights)
- Agent shortlist view in task — top 10 per suburb, registered only, agency grouping visible
- Agent registration: fuzzy profile match (name + agency + suburb, top 3 candidates) or new with self-declared license
- Agent portal: profile claim, agency view
- Admin verification queue (approve/reject license claims)

**Note:** the Property Scout (Domain listings) agent sits between Growth Analysis and Agent Discovery in the state machine but has no phase assigned yet. Decide whether it ships in MVP or the shortlist goes straight from suburbs to agents.

---

## Phase 5 — Outreach (Week 9)

- Resend/SendGrid integration + `EmailDispatchWorker`
- Outreach composer in-app; platform sends; replies route to my email
- Spam Act compliance: consent record, sender identification, functional unsubscribe, suppression list
- `TaskAgentContacts` tracking: contacted / responded / no response
- Weekly follow-up cadence (scope per Q05)

---

## Post-MVP backlog

Chat (WebSocket, thread-per-task-per-agent, email notification fallback) · PDF export · payment/billing · automated state license verification · off-market listings with visibility controls · proactive suburb alerts · evaluation harness for agent output quality · preset back-test calibration (D17) · reusable investor profiles (D18, after Q10) · sponsored placement slot (D12/D13, after Q12) · mortgage broker persona (D15) · HtAG enterprise terms / cap increases (Q18)

---

## Critical path

```
P0-5 spike ──▶ P1-4/P1-6 (orchestration) ──▶ Phase 2 agents ──▶ everything else
   │
   └─ if it fails: redesign orchestrator, +1–2 weeks

P1-8 ranking ─┐
P1-3 criteria ┼──▶ P1-4 screener
P1-1 client ──┘
P1-10 ABS (soft) ─▶ P1-4

Q13(i) Reference billing ──▶ P1-4 config (query limit 100 vs 80)
Q16 state field + vacancy units ──▶ P1-3 merge
Q08 snapshot redaction ──▶ Phase 3 schema
Q10/Q11 tenancy + roles ──▶ Phase 4
Q03 (ORM) ──▶ P0-2
```
