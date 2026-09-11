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
| D33 | Drizzle over Prisma | PROVISIONAL | Drizzle doesn't fight raw TimescaleDB/hypertable queries. Confirm before P0-2 |

---

## Open questions

| # | Question | Blocks | Why it matters |
|---|---|---|---|
| Q01 | Which HTAG tier includes historical time-series, and what are the rate limits? | P1-1, P1-2 | Determines whether the weekly full-suburb refresh is affordable, and whether we need to narrow the refresh scope |
| Q02 | Criteria as fixed structured fields, or natural-language prompt parsed into filters? | P1-3 | Fixed is predictable and shippable; NL is more "AI-native" but adds a parsing agent and a failure mode. Leaning fixed for MVP |
| Q03 | Drizzle vs Prisma — confirm D33 | P0-2 | Schema work starts here, hard to change later |
| Q04 | Geographic scope for the first working run — all states, or one state to validate? | P1-2 | Smaller scope means faster iteration and lower API cost during development |
| Q05 | How is the "weekly contact cadence" (original Step 6) modelled? | Phase 5 | Currently only `TaskAgentContacts.status` is sketched. A real cadence needs reminders and follow-up scheduling |
| Q06 | Spam Act compliance specifics for platform-sent email on my behalf | Phase 5 | Consent, sender identification, functional unsubscribe. Affects the email schema and send path |
| Q07 | Does the Growth Analyser need a web-search tool, or is HTAG + Domain + ABS enough? | Phase 2 | Adds a non-deterministic, hard-to-evaluate input if yes |

---

## Decision log changelog

| Date | Change |
|---|---|
| (initial) | D01–D33 captured from the design conversation. D22 and D33 flagged provisional. Q01–Q07 outstanding. |
