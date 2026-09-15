# 05 — Roadmap & Phases

## MVP boundary

**In:** Purchase Task creation with criteria UI · Suburb Screener across all HTAG suburbs · Trend Analyser · Growth Potential Analyser · HITL gates at every stage · run log · report web view · data locking · task cloning · Agent Discovery (registered agents only, agency grouping visible) · agent registration with manual verification · platform-sent outreach email · email notifications on gates

**Out (post-MVP):** chat/messaging · PDF export · payment integration · off-market listings · automated license verification · Property Scout listings integration (see note in Phase 4)

---

## Phase 0 — Foundation (Week 1)

**Goal:** skeleton monorepo, auth working, DB migrated, empty task list rendering, and the orchestration risk retired.

| Ticket | Description | Acceptance criteria |
|---|---|---|
| ~~P0-1~~ | Monorepo scaffold **done 2026-09-10** | Turborepo + pnpm workspace with `apps/api` (NestJS), `apps/web` (Next.js), `apps/worker`, `packages/shared` (types, constants, Zod schemas). Shared tsconfig, lint, CI. |
| ~~P0-2~~ | Database setup — **done 2026-09-14** | Postgres with TimescaleDB + pgvector enabled. Schema for `Users`, `Tenants`, `PurchaseTasks`, `Suburbs`, plus a `suburb_metrics_ts` hypertable and a pgvector column so both extensions are exercised, not merely installed. ~~Migrations run on startup~~ → explicit `pnpm db:migrate` (D39). `tenant_id` present everywhere, enforced by a test. RLS policies live and verified against a non-superuser role (D40). |
| P0-3 | Auth integration | Clerk or Supabase Auth. JWT middleware in NestJS. Tenant resolution from the token. RLS policies applied. |
| P0-4 | Redis + BullMQ wiring | `@nestjs/bullmq` registered. One test queue + `@Processor` that logs a job. Bull Board mounted at `/admin/queues`. |
| **P0-5** | **LangGraph.js HITL spike** | **Riskiest ticket — do this first.** Minimal graph, 3 nodes, one `interrupt()`. Postgres checkpointer via `PostgresSaver`. Verify: run pauses, thread status is `interrupted`, process can restart while paused, resume command continues from checkpoint, state survives. |
| P0-6 | Next.js shell | Auth-gated routes, nav layout, empty task list, placeholder task detail. |

**Deliverable:** I can log in, see an empty task list, and pause/resume is proven end-to-end.

**Gate:** if P0-5 fails, stop and redesign the orchestrator before Phase 1.

---

## Phase 1 — HTAG Integration + Suburb Screener (Weeks 2–3)

**Goal:** create a task with criteria → batch screener runs across all suburbs → ranked results → HITL approval gate.

| Ticket | Description | Acceptance criteria |
|---|---|---|
| P1-1 | HTAG REST client | Typed client (official `htag-sdk` or fetch + Zod). API key in env. Rate-limit throttling with exponential backoff. Contract tests against sandbox. |
| P1-2 | Suburb seed + refresh worker | BullMQ repeatable job (weekly) pulls all suburbs from HTAG, upserts into `Suburbs` + `SuburbMetricsTS`. Batched at 500 with backoff. On-demand single-suburb refresh. |
| P1-3 | Criteria schema + UI | Zod schema: vacancy rate, stock on market, renter proportion, demand-to-supply, median yield, days on market, price range, target states, property type. Each toggleable. Next.js 3-step form (React Hook Form + Zod resolver). Saves to `criteria_json`. Save-as-draft supported. |
| P1-4 | Suburb Screener agent | LangGraph node. Reads criteria, queries `SuburbMetricsTS` (local cache, **not** HTAG live), applies filters, scores, writes ranked `ScreeningResults`. Calls `interrupt()` with typed payload `{ type: 'SCREENING_APPROVAL', criteria, rankedSuburbs }`. |
| P1-5 | Approval UI | Renders the interrupt payload as a review screen: ranked table, score breakdown, exclude-with-undo, criteria summary, Approve & Continue / Reject & Adjust. Resumes the graph via API endpoint. |
| P1-6 | Task state machine wiring | Graph: `DRAFT → SCREENING → (interrupt) → TREND_ANALYSIS`. `PurchaseTasks.status` syncs with graph state. Every node execution writes an `AnalysisSteps` row. |
| P1-7 | Screening results view | Sortable, filterable, paginated table with density toggle and score breakdown. Suburb detail drawer. |

**Deliverable:** create a task, define criteria, watch the screener run async, review the ranked list, approve or reject, see the task advance.

---

## Phase 2 — Trend + Growth Analysers (Weeks 4–5)

- ABS census ETL worker (SA2-level DataPacks CSV → Postgres; one-off + annual)
- Trend Analyser agent — historical HTAG time-series, stability metrics, narrative + score
- Growth Potential Analyser agent — HTAG + Domain + ABS (+ web search, pending Q07)
- Autonomy config UI (per-agent-type defaults, per-run override)
- Run log viewer — each agent's inputs, outputs, tool calls, reasoning, token cost
- Report web view aggregating all stage outputs

**Deliverable:** full criteria → report pipeline with HITL at each stage.

---

## Phase 3 — Locking + Cloning (Week 6)

- `locked_at` + `TaskArtifacts` snapshot on CONTACT_AGENT transition
- Immutability enforcement (artifacts can't be written post-lock)
- Clone task action
- Task version/lineage display (`cloned_from_task_id`)

---

## Phase 4 — Agent Discovery + Registration (Weeks 7–8)

- RateMyAgent scrape via Apify actor → `ScrapedAgents` + `Agencies`
- Ranking module (pure function, unit tested against D31 weights)
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

Chat (WebSocket, thread-per-task-per-agent, email notification fallback) · PDF export · payment/billing · automated state license verification · off-market listings with visibility controls · proactive suburb alerts · evaluation harness for agent output quality.

---

## Critical path

```
P0-5 spike ──▶ P1-4/P1-6 (orchestration) ──▶ Phase 2 agents ──▶ everything else
   │
   └─ if it fails: redesign orchestrator, +1–2 weeks

Q01 (HTAG tier) ──▶ P1-1/P1-2 (can't size the refresh job without it)
```
