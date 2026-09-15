# 04 — Decisions Log

> **This is the living document.** Every other file in this Project describes a consequence of something recorded here. When a decision changes, change it here first, then propagate. Re-upload to the Project knowledge base after every edit.

Status key: **LOCKED** (don't relitigate without flagging) · **PROVISIONAL** (leaning, not committed) · **OPEN** (needs a decision)

---

## Scope & product

| # | Decision | Status | Rationale / ripple |
|---|---|---|---|
| D01 | Paid SaaS eventually; MVP is single-user (me), no payment integration | LOCKED | Multi-tenancy still built in from day one |
| D02 | Purchase Task is the aggregate root, not the suburb or the analysis run | LOCKED | Everything — artifacts, shortlists, outreach — belongs to exactly one task |
| D03 | Whole pipeline runs on task creation with data current at that moment | LOCKED | No background re-screening, no proactive "new suburbs match" alerts |
| D04 | Task locks at CONTACT_AGENT; artifacts snapshotted immutably | LOCKED | The report I acted on is the record |
| D05 | Cloning is the path to re-running with fresh data | LOCKED | Original stays locked; outreach threads stay attached to it |
| D06 | Report is web view only for MVP | LOCKED | No Puppeteer/Playwright render service needed yet |
| D07 | No off-market listings on the platform | LOCKED | Removes the listings module + visibility controls entirely |
| D08 | Chat/messaging deferred post-MVP | LOCKED | No WebSocket infra needed for MVP |
| D09 | Unregistered agents cannot be picked | LOCKED | Constrains the agent pool; makes registration the growth loop |
| D10 | Agents register as individuals; investors can browse all agents in an agency | LOCKED | Needs an `Agencies` entity even though registration is individual |
| D11 | Outreach = platform-sent email (Option B) | LOCKED | Email infra on day one; reply routing; Spam Act compliance in the send path |

## Technical

| # | Decision | Status | Rationale / ripple |
|---|---|---|---|
| D20 | HTAG (developer.htagai.com) is the primary data source, replacing DSR | LOCKED | DSR has no public API; HTAG has both REST and a native MCP server, plus historical data |
| D21 | Backend is Node.js / NestJS | LOCKED | Changed from FastAPI. Cost: the AI-agent ecosystem is thinner in TS. Benefit: one language across the stack, matches my depth |
| D22 | LangGraph.js as the orchestrator | PROVISIONAL | Contingent on the P0-5 spike. Fallback: hand-rolled state machine with Redis-backed pause state |
| D23 | BullMQ replaces Celery for async work | LOCKED | Follows from D21. Job Schedulers handle the weekly refresh |
| D24 | Postgres + TimescaleDB + pgvector, single instance | LOCKED | Language-agnostic; unaffected by D21 |
| D25 | Modular monolith, not microservices | LOCKED | Domain boundaries drawn to map onto future service boundaries |
| D26 | `tenant_id` on every table + RLS from day one | LOCKED | Retrofitting is the expensive version |
| D27 | Weekly cache of all suburb metrics into TimescaleDB; screening queries local DB | LOCKED | Cost control. Only Trend/Growth analysers hit HTAG live |
| D28 | ABS census ingested as a static snapshot (SA2-level DataPacks CSV) | LOCKED | One-time ETL + annual refresh, not a live dependency |
| D29 | Autonomy config is per-agent-type **and** per-run | LOCKED | Policy engine must exist from day one even though MVP is all-HITL |
| D30 | All stages default to HITL for MVP | LOCKED | Approval UI is core, not optional |
| D31 | Agent ranking = 0.4 × rating + 0.3 × log(reviews) + 0.3 × recent solds | LOCKED | Pure function, unit-testable, no LLM |
| D32 | License verification is manual for MVP | LOCKED | 8 states, mostly web forms. Automated verification is post-MVP |
| D33 | Drizzle over Prisma | LOCKED | Wins on hypertables + pgvector, the two things that matter for this schema. No parallel migration systems to keep in sync. |
| D34 | Oxlint + oxfmt for lint and format | LOCKED | Single fast toolchain; no type-aware lint rules — `tsc --noEmit` in CI covers that class of bug |
| D35 | Vitest as the single test runner across all workspaces | LOCKED | Nest apps transform through SWC (`unplugin-swc`) because esbuild does not emit decorator metadata |
| D36 | Code and docs share one repo; docs live under `docs/` | LOCKED | Docs are versioned with the code they describe; Project knowledge is uploaded from `docs/` |
| D37 | Schema lives in `packages/db`, not inside `apps/api` | LOCKED | The API, the worker and (from P0-5) the LangGraph checkpointer all need the same tables. A fourth workspace package is cheaper than an app-to-app dependency |
| D38 | Reference data is owned by a well-known system tenant (`00000000-…-0000`) | LOCKED | Honours D26 literally without copying 7,000 suburbs per tenant or making `tenant_id` nullable. RLS read policies on `suburbs` allow own-tenant OR system; writes require acting as the system tenant |
| D39 | Migrations are an explicit release step (`pnpm db:migrate`), not run on app startup | LOCKED | Overrides the P0-2 acceptance criteria as originally written. Startup migration races api against worker on deploy, turns a bad migration into an outage instead of a failed release, and rules out zero-downtime deploys |
| D40 | The app connects as `my_ba_app` (NOSUPERUSER, NOBYPASSRLS); only migrations connect as the owner | LOCKED | Postgres RLS is bypassed by superusers unconditionally. Connecting the app as `postgres` would make every policy in D26 inert, and with one tenant nothing would look wrong. `GET /api/health/db` reports whether the live connection is actually subject to RLS |
| D41 | `users` mirrors the identity provider; Clerk owns credentials, sessions and MFA | LOCKED | Confirms the Clerk side of the P0-3 choice. `users.external_auth_id` holds the Clerk id so the provider can be swapped without touching foreign keys. Supabase Auth's advantage is RLS wired to `auth.uid()` on Supabase's own Postgres, which is unavailable when self-hosting TimescaleDB |
| D42 | `drizzle-kit generate` owns table DDL; only extensions, hypertables and RLS are `--custom` migrations | LOCKED | One journal, one migration table. Hand-writing everything was considered and rejected: it saves nothing and recreates the DDL-by-hand cost that D33 avoided |
| D44 | `suburb_embeddings` dropped; pgvector stays installed and unused until agent memory is designed | LOCKED | It existed only to prove the extension, and it did — `0001` built an HNSW index against the real image, so the proof is banked. Keeping it left a named table implying a feature nobody specified: D24 and `docs/02` say pgvector is for agent memory, not suburb embeddings. The first real vector table gets designed against a Phase 2 access pattern instead of a guess at dimensions and an opclass |
| D43 | `suburb_metrics_ts` has no RLS policy — the one exception to D26 | LOCKED | TimescaleDB: "ROW LEVEL SECURITY is not supported on compressed chunks", so compression and RLS are mutually exclusive on that table. Compression wins: it holds only system-tenant reference data every tenant reads by design, so a policy protects nothing, and it will be the largest table in the system. `tenant_id` stays NOT NULL (D26's column rule is untouched) and a CHECK constraint pins every row to the system tenant, so it cannot come to hold tenant-private data by accident. Separately, timescale/timescaledb#7830 reports hypertable RLS policies are not propagated to chunks, so RLS here would have been partial anyway |

---

## Open questions

| # | Question | Blocks | Why it matters |
|---|---|---|---|
| Q01 | Which HTAG tier includes historical time-series, and what are the rate limits? | P1-1, P1-2 | Determines whether the weekly full-suburb refresh is affordable, and whether we need to narrow the refresh scope |
| Q02 | Criteria as fixed structured fields, or natural-language prompt parsed into filters? | P1-3 | Fixed is predictable and shippable; NL is more "AI-native" but adds a parsing agent and a failure mode. Leaning fixed for MVP |
| Q04 | Geographic scope for the first working run — all states, or one state to validate? | P1-2 | Smaller scope means faster iteration and lower API cost during development |
| Q05 | How is the "weekly contact cadence" (original Step 6) modelled? | Phase 5 | Currently only `TaskAgentContacts.status` is sketched. A real cadence needs reminders and follow-up scheduling |
| Q06 | Spam Act compliance specifics for platform-sent email on my behalf | Phase 5 | Consent, sender identification, functional unsubscribe. Affects the email schema and send path |
| Q07 | Does the Growth Analyser need a web-search tool, or is HTAG + Domain + ABS enough? | Phase 2 | Adds a non-deterministic, hard-to-evaluate input if yes |

---

## Decision log changelog

| Date | Change |
|---|---|
| (initial) | D01–D33 captured from the design conversation. D22 and D33 flagged provisional. Q01–Q07 outstanding. |
| 2026-09-11 | P0-1 delivered. D34–D36 added (Oxlint/oxfmt, Vitest, single repo with `docs/`). Q03 still open and now blocking P0-2. |
| 2026-09-15 | D44 added — `suburb_embeddings` dropped as speculative. D43 added after `0005_rls` failed on the hypertable. Also fixed a deadlock in `db:migrate` (pool of 1 shared between the advisory-lock holder and the migrator). |
| 2026-09-14 | Q03 closed — D33 (Drizzle) was already LOCKED in the table above and Q03 had been dropped from the open-questions list; only this changelog still called it open. P0-2 delivered. D37–D42 added. |
