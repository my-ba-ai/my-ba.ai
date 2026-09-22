# 05 — Roadmap & Phases

## MVP boundary

**In:** Purchase Task creation with investor profile (strategy × risk) and criteria UI · Suburb Screener via HtAG server-side query + our own strategy-weighted ranking · Trend Analyser · Growth Potential Analyser · HITL gates at every stage · run log with per-step HtAG cost · report web view with HtAG attribution · data locking · task cloning · Agent Discovery (registered agents only, agency grouping visible) · agent registration with manual verification · platform-sent outreach email · email notifications on gates

**Out (post-MVP):** chat/messaging · PDF export · payment integration · off-market listings · automated license verification · Property Scout listings integration (see note in Phase 4) · sponsored placement (D12/D13) · reusable investor profiles (D18) · preset back-test calibration (D17) · HtAG Agent API narratives (D41)

---

## Phase 0 — Foundation (Week 1)

**Goal:** skeleton monorepo, auth working, DB migrated, empty task list rendering, and the orchestration risk retired.

| Ticket     | Description                                               | Acceptance criteria                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ---------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P0-1       | Monorepo scaffold                                         | Turborepo + pnpm workspace with `apps/api` (NestJS), `apps/web` (Next.js), `apps/worker`, `packages/shared` (types, constants, Zod schemas). Shared tsconfig, lint, CI.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| P0-2       | Database setup                                            | Postgres with TimescaleDB + pgvector enabled. Schema for `Users`, `Tenants`, `PurchaseTasks`, `Suburbs`. Migrations run on startup. `tenant_id` present everywhere.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| P0-3       | Auth integration                                          | Clerk or Supabase Auth. JWT middleware in NestJS. Tenant resolution from the token. RLS policies applied.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| P0-4       | Redis + BullMQ wiring                                     | Redis in `docker-compose` (`noeviction`, AOF). `@nestjs/bullmq` registered in API (producer) and worker (consumer). `diagnostics` queue: authenticated `POST /api/diagnostics/jobs` enqueues a tenant-stamped payload (D49), worker `@Processor` parses and logs it. Bull Board at `/api/admin/queues` behind basic auth, dev only (D48). `GET /api/health/redis`. Identity cache moved to Redis (D50). **Done.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **P0-5**   | **LangGraph.js HITL spike**                               | **Riskiest ticket — do this first.** Minimal graph, 3 nodes, one `interrupt()`. Postgres checkpointer via `PostgresSaver`. Verify: run pauses, thread status is `interrupted`, process can restart while paused, resume command continues from checkpoint, state survives. Built as `packages/orchestrator`; checkpoints in the `langgraph` schema (D51); gate is `pnpm test:integration`. **Done.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **P0-5.5** | **UI foundation (shadcn/ui + Base UI + Tailwind tokens)** | Tailwind/globals.css carries every CSS variable from `design-system.md` §1 verbatim, light mode only. Manrope (D55; originally Space Grotesk + JetBrains Mono) self-hosted via `next/font/google` at build time (D53), `tabular-nums` applied to every data context (`font-data`) — no Google Fonts CDN call at runtime. shadcn/ui initialized with Base UI base (`-b base`); `button`, `input`, `select`, `combobox`, `dialog`, `drawer`, `sheet`, `tabs`, `tooltip`, `popover`, `checkbox`, `radio-group`, `switch`, `slider`, `toast`/`sonner`, `table`, `skeleton`, `badge` pulled as editable source in `apps/web/src/components/ui/`. Spike check: dual-thumb budget range slider and a ~50-option multi-select combobox both work with keyboard nav and close/blur correctly nested inside a `Dialog`; if Base UI's version is broken, pull that one component from the React Aria base instead. `react-hook-form` + `@hookform/resolvers/zod` wired through the shadcn `field` primitives (the Base UI registry ships no `Form`); one smoke-test form round-trips through a `z.object()` schema with validation errors in the design system's inline red pattern (§4). TanStack Table installed with one working example rendered through a custom card-row `<div>` layout, not the shadcn default `<table>` markup. No orphaned default shadcn theme tokens (`--primary`, default `--radius`, etc.) left in `globals.css`. **Risk: medium** — narrowly on the Base UI Combobox/Slider spike; everything else is low-risk setup. **Depends on:** P0-1. **Done** — gallery at `/dev/ui` (404s in production). Spike passed 8/8 keyboard checks; D52 LOCKED. |
| P0-6       | Next.js shell                                             | Auth-gated routes, nav layout, empty task list (real tenant-scoped read API), placeholder task detail, sign-in split layout. See P0-6 below. **Implemented, verification pending.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

**Deliverable:** I can log in, see an empty task list, and pause/resume is proven end-to-end.

**Gate:** if P0-5 fails, stop and redesign the orchestrator before Phase 1.

### P0-6 — Next.js shell

**Description:** Replaces the temporary P0-3 identity page with the real app shell. Every route except sign-in is behind a session, and there's a sidebar/header layout. The task list reads from a real tenant-scoped API that returns nothing yet, and the task detail page is a placeholder. The Phase 0 deliverable ("I can log in, see an empty task list") ends here.

- **API (`apps/api`):** a new `purchase-tasks` module with two read-only routes, both through `TenantDatabaseService` (RLS, no explicit `tenant_id` filter, so isolation rests on the policy exactly as it will in P1):
  - `GET /api/purchase-tasks` → `{ items: PurchaseTaskSummary[] }`, ordered `updated_at desc`. No pagination: filter tabs, sort and paging ship with P1-3, when there are tasks to page.
  - `GET /api/purchase-tasks/:taskId` → `PurchaseTaskDetail`. A non-uuid id gives 400 (`ZodValidationPipe`). An id that's absent _or belongs to another tenant_ gives 404, and the two are indistinguishable by design.
- **Contract (`@my-ba/shared`):** `schemas/purchase-task.ts` holds `purchaseTaskSummarySchema` (`id, name, status, lockedAt, clonedFromTaskId, createdAt, updatedAt`; timestamps are ISO-8601 strings), `purchaseTaskDetailSchema` (summary + `criteria: Record<string, unknown>` while Q02 is open), `listPurchaseTasksResponseSchema`, and `purchaseTaskIdParamSchema`. The API parses its own output with these, and the web parses it again in `apiFetch`.
- **Route protection (`src/proxy.ts`):** `clerkMiddleware` + `createRouteMatcher`. Public means `/sign-in(.*)` only. Everything else calls `auth.protect()`, which redirects to `NEXT_PUBLIC_CLERK_SIGN_IN_URL`. `/dev/*` stays dev-only through its layout and now also needs a session.
- **Routes (`apps/web`):** `/` redirects to `/tasks`. The `(app)` route group has the shell layout, `/tasks` and `/tasks/[taskId]`. The P0-3 identity diagnostic moves to `/dev/whoami`. Sign-in lives at `/sign-in/[[...sign-in]]`.
- **Shell:** a left sidebar with the wordmark, Tasks (active), Agents (Phase 4), Reports (Phase 2) and Settings (Phase 2, autonomy config), plus Clerk `<UserButton>` in the footer. Nav items for unbuilt phases are rendered but disabled, with a tooltip naming the phase: no dead routes. The page header has a primary "+ New Purchase Task" button, disabled, with the tooltip "Task creation arrives in P1-3".
- **Task list states:** empty state with the 3-step workflow explainer (define criteria → approve each analysis stage → contact agents), `loading.tsx` shimmer skeleton matching the card-row layout, and an error state that names the failing link (unreachable / API refused / contract mismatch) with the raw line in `font-mono`, following the P0-3 page's classification. The populated card row (name, status pill, compact stage stepper, LOCKED chip when `lockedAt` is set, last-updated) is built and tested against fixtures. Filter tabs, sort, shortlist count, criteria summary and the overflow menu are **out**; they need data or mutations that arrive in P1–P3.
- **Task detail placeholder:** breadcrumb (Tasks / name), status pill, full stage stepper, created/updated timestamps, and a notice that stage views arrive in Phase 1. It calls `notFound()` on API 404/400.
- **Sign-in:** a split layout. On the left is Clerk `<SignIn>` (max 400px, `appearance.variables` mapped to design tokens, `fallbackRedirectUrl="/tasks"`). On the right is a marketing panel with a tagline and three value props over a CSS-only abstract background (one `drift` animation). Below `lg` it collapses to the form only. No sign-up route. Restricting sign-ups is a Clerk dashboard setting (Restrictions → allowlist or Restricted mode), not code.

**Acceptance criteria:**

1. Signed out, `/`, `/tasks`, `/tasks/<uuid>` and `/dev/ui` all redirect to `/sign-in`. `/sign-in` renders without a session.
2. Signed in, `/` lands on `/tasks`, which shows the empty state. That state is driven by a real `GET /api/purchase-tasks` returning `{ items: [] }`, not a hard-coded branch.
3. With the API stopped, `/tasks` renders the error state naming "unreachable", and nothing throws to the Next error overlay.
4. `/tasks/<random uuid>` renders the 404 page. `/tasks/not-a-uuid` renders the 404 page.
5. API unit specs: the list/detail service maps rows to the shared schema, detail throws `NotFoundException` on an empty result, and the controller rejects a non-uuid param with 400.
6. Web tests (Vitest + Testing Library): the task card renders name, status label, stepper position and LOCKED chip from fixtures. The empty state renders the three steps. Disabled nav items expose `aria-disabled` and their phase label.
7. `pnpm typecheck`, `pnpm lint`, `pnpm test` and `pnpm build` pass.
8. Every new screen uses only design-system tokens. No `dark:` classes, and numbers/timestamps/ids are in `font-data`.

**Dependencies:** P0-3, P0-5.5. **Risk:** low. Watch item: Clerk `appearance` can't reach every internal element of `<SignIn>`, so accept Clerk's own layout inside the 400px column rather than fighting it with CSS overrides.

### P0-7 — CI integration job for the P0-5 durability suite

**Description:** CI has no Postgres, so `pnpm test:integration` (the P0-5 gate) runs only on a dev machine. A regression in LangGraph or the checkpointer — a `@langchain/*` bump, a `PostgresSaver` schema change, a lost grant on `langgraph.*` — would merge unnoticed. Add a second job, `integration`, to `.github/workflows/ci.yml`.

- Start Postgres with `pnpm db:up` (`docker compose up -d --wait postgres`), **not** a GitHub Actions `services:` container. The `my_ba_app` role is created by `infra/postgres/init/01-app-role.sql` through `docker-entrypoint-initdb.d`. Service containers start before checkout and can't mount repo files, so that path would need a second copy of the role setup.
- Job env: `DATABASE_URL=postgresql://my_ba_app:app@localhost:5432/my_ba`, `DATABASE_MIGRATION_URL=postgresql://postgres:postgres@localhost:5432/my_ba`. No `.env` files; `loadEnvFiles` already tolerates their absence.
- Steps: checkout → pnpm/node setup → `pnpm install --frozen-lockfile` → `pnpm turbo run build --filter=@my-ba/orchestrator...` (the suite imports `@my-ba/db` from `dist`) → `pnpm db:up` → `pnpm db:migrate` → `pnpm test:integration`.
- Only Postgres is started; Redis isn't needed.
- On failure, upload `docker compose logs postgres` as an artifact.

**Acceptance criteria:**

1. `integration` runs on every PR and on push to `main`, in parallel with `verify`.
2. It runs the full `hitl-durability.integration.spec.ts` suite against `timescale/timescaledb-ha:pg17` (the same image as `docker-compose.yml`) and passes on `main`.
3. The test connects as `my_ba_app`. A step asserts `SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user` returns `false, false`, so the suite can't pass by accident as a superuser.
4. `pnpm db:migrate` runs from an empty database in CI: Drizzle journal including `0009_langgraph_schema`, then `checkpointer:setup`. This also proves migrations work from scratch, which nothing checks today.
5. Deliberately breaking the suite (e.g. asserting `prepare` ran twice) fails the job. Verify once on a throwaway branch, then revert.
6. `integration` is added as a required status check on `main` alongside `verify`.
7. Job timeout ≤ 15 min. Record the observed image pull time in the PR description.

**Dependencies:** P0-5 (suite, migration 0009 committed). **Risk:** low. Watch items: the `timescaledb-ha` image is large (multi-GB), so the pull may dominate job time; if it's over ~3 min, consider the slimmer `timescale/timescaledb` image plus the pgvector extension, recorded as a D-code because it diverges from local dev. The SIGKILL/child-process tests can be timing-sensitive on shared runners, so fix any flake at its cause rather than adding retries.

---

### P0-8 — Mechanical secret scanning (CI + pre-commit)

**Description:** `AGENTS.md` bans secrets and key-shaped literals in tracked files, but a written rule only works if whoever is writing reads it, and an agent has already broken it once (a format-valid Clerk dummy key in `ci.yml`, caught before commit). Enforce the rule with [gitleaks](https://github.com/gitleaks/gitleaks) at two points: before a commit exists, and before a merge.

- **Config:** `.gitleaks.toml` at the repo root that extends the default ruleset (`[extend] useDefault = true`), plus:
  - Custom rules for the providers this project uses where the defaults might not cover them: Clerk `pk_(test|live)_…` and `sk_(test|live)_…`, and HtAG, Domain, Apify, Resend/SendGrid and Cloudflare R2 token shapes. For each provider, check the gitleaks default rules first and add a rule only where one is missing; don't guess at token formats.
  - An allowlist that is exactly: the `*_replace_me` placeholders in `**/.env.example`, and the local docker-compose credentials (`postgres:postgres@localhost`, `my_ba_app:app@localhost`) in `.env.example`, `docker-compose.yml` and `infra/postgres/init/`. Nothing broader: no whole-file or whole-directory allowlists.
- **CI:** a `secrets` job in `.github/workflows/ci.yml`, in parallel with `verify`.
  - Checkout uses `fetch-depth: 0`.
  - Run the **gitleaks CLI** (pinned version, checksum-verified download), not `gitleaks/gitleaks-action`: the action needs a `GITLEAKS_LICENSE` for repos owned by an organisation (`my-ba-ai` is one), and the CLI doesn't.
  - Scan the commits in the PR range on PRs, and the full history on push to `main`.
  - Use `--redact` so a finding never prints the secret into the Actions log. Upload the SARIF/JSON report as an artifact.
- **Pre-commit:**
  - Add [lefthook](https://github.com/evilmartians/lefthook) (a devDependency, installed through the root `prepare` script) with a `pre-commit` hook that scans **staged** changes only.
  - The subcommand differs across gitleaks v8 minors (`protect --staged` vs `git --staged`), so use whatever the pinned version's `--help` shows.
  - If `gitleaks` isn't installed, the hook prints `brew install gitleaks` and fails. It does not skip silently.
- **Docs:** `AGENTS.md` → "Secrets and credentials" says the hook and CI job exist, that `git commit --no-verify` is not an agent option, and how to add a _reviewed_ allowlist entry (as a PR that names the reason). README "Getting started" gets the `brew install gitleaks` step.
- **One-off:** scan the full history once when this lands and record the result (clean, or findings → rotate first, then decide whether to rewrite history) in the PR description.

**Acceptance criteria:**

1. `gitleaks` over the full history of `main` exits 0 with the committed config. Any real finding is rotated at the provider _before_ it's allowlisted or the history is rewritten.
2. On a throwaway branch, committing a file containing `pk_test_` + base64(`example.clerk.accounts.dev$`) is **blocked by the pre-commit hook**. Pushing it with `--no-verify` then **fails the `secrets` CI job**. Both are shown in the PR description, and the branch is deleted afterwards.
3. The same test with an AWS-shaped key (`AKIA…`) and a PEM private-key header is also caught (this proves the default rules are active).
4. `pk_test_replace_me` in an `.env.example` and `postgres:postgres@localhost` in `docker-compose.yml` are **not** flagged.
5. CI logs show findings redacted. No matched value appears in plain text.
6. `secrets` is a required status check on `main`, next to `verify` (and `integration` once P0-7 lands).
7. The hook adds < 1 s to a typical commit (it scans staged changes, not the repo).
8. A fresh clone plus `pnpm install` installs the hook with no extra step, apart from installing the gitleaks binary.

**Dependencies:** none (can land before P0-7; if both touch `ci.yml`, whichever lands second rebases). **Risk:** low.

**Watch items:**

- False positives on generated files (`pnpm-lock.yaml` integrity hashes, `drizzle/meta/*_snapshot.json` ids). If they appear, fix them with narrow path+rule allowlists, never by disabling the rule.
- The hook is local and can be bypassed. CI is the real gate, and the hook just catches mistakes earlier.
- **Optional:** GitHub's native secret scanning with push protection blocks the push itself. It's free for public repos; for a private org repo, check the current GitHub plan and pricing before relying on it. It complements gitleaks rather than replacing it (it only knows partner token formats).

### P0-9 — Git hooks: format + lint on pre-commit, typecheck on pre-push

**Description:** CI runs `pnpm check` (typecheck, lint, format:check, test). Format and lint failures have reached CI more than once (PR #1, and the P0-5 follow-up "Fixed format issue"), though they're cheap to catch locally. Add git hooks via [lefthook](https://github.com/evilmartians/lefthook) so those failures surface before a commit or push. CI stays the real gate; hooks are just an early warning and can be bypassed.

- **Hook manager:** lefthook, as a root devDependency, installed by the root `prepare` script (`lefthook install`). P0-8 uses the same tool: whichever ticket lands first adds lefthook and `lefthook.yml`, and the other only adds its commands. Don't introduce a second hook manager.
- **`pre-commit`**, with commands running in parallel on **staged files only**:
  - `tailwind`: `pnpm --filter @my-ba/web run lint:tailwind` when any `apps/web/src/**/*.{ts,tsx}` file is staged. It scans the whole app, which is fast, and it's part of `pnpm lint` since D59.
  - `format`: runs `oxfmt` in write mode on `{staged_files}` and re-stages the result (`stage_fixed: true`). The glob covers what oxfmt formats in this repo. It also excludes `.oxfmtrc.json` `ignorePatterns` (`packages/db/drizzle/**`, `pnpm-lock.yaml`, `docs/prototypes/**`, build output), in case oxfmt doesn't apply its ignore list to explicit paths. Check the pinned oxfmt's behaviour, and how it handles an empty or unmatched file list, rather than assuming.
  - `lint`: runs `oxlint` on staged `*.{ts,tsx,js,jsx,mjs,cjs}`, check only (no `--fix`). It blocks the commit on any error and prints the diagnostics. Warnings don't block, matching CI.
- **`pre-push`**:
  - `typecheck`: runs `pnpm typecheck` (Turbo, so cached packages are skipped). It's too slow for every commit but cheap enough per push. It blocks the push on failure.
- **Partially staged files:** auto-fixing plus `stage_fixed` must not sweep unstaged hunks into the commit. Check how the pinned lefthook version handles this. If it doesn't stash unstaged changes itself, the `format` command must check-only on partially staged files and tell the user to run `pnpm format`.
- **Docs:**
  - README "Getting started": hooks install on `pnpm install`, and what each hook runs.
  - README "Scripts": a `pnpm hooks:run` alias (`lefthook run pre-commit --all-files`) for a manual full run.
  - `AGENTS.md`: agents must not use `--no-verify` or `LEFTHOOK=0`. If a hook fails, fix the cause.

**Acceptance criteria:**

1. A fresh clone plus `pnpm install` leaves `.git/hooks/pre-commit` and `pre-push` installed, with no extra step.
2. Staging a `.ts` file with wrong quotes or semicolons, then committing, produces a commit whose content is correctly formatted. `pnpm format:check` passes right after.
3. Staging a file with an oxlint error (e.g. `typescript/no-explicit-any`) blocks the commit, and the output names the file and rule.
4. A type error in a committed file blocks `git push`, and `pnpm typecheck` shows the same error.
5. A partially staged file (one hunk staged, one not) never has its unstaged hunk committed. Demonstrate it in the PR description.
6. Staged `pnpm-lock.yaml` and `packages/db/drizzle/*` files are not reformatted.
7. A commit touching only `docs/*.md` finishes in under ~1 s. `pre-commit` never runs the whole-repo `format:check` or `lint`.
8. A commit that changes no files the hooks cover (e.g. only an image) succeeds, rather than failing on an empty file list.
9. CI is unchanged: `pnpm check` is still the gate.

**Dependencies:** none. It shares lefthook with P0-8 (see above). **Risk:** low.

**Watch items:**

- oxfmt is pre-1.0 and has broken on config before (D34 note). Pin its version, and re-check AC 2 and 6 on every oxfmt bump.
- If pre-push typecheck gets slow as Phase 1 grows, consider scoping it to changed packages (`turbo --filter=...[origin/main]`) rather than dropping it.

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
