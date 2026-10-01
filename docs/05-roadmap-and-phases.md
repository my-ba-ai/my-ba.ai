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
| P0-6       | Next.js shell                                             | Auth-gated routes, nav layout, empty task list (real tenant-scoped read API), placeholder task detail, sign-in split layout. See P0-6 below. **Done.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

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

**Verified (2026-09-24).** `pnpm check` and `pnpm build` pass; browser walk-through of AC 1–4 and the AC 8 token review done on macOS. **P0-6 complete.**

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

**Done.** Verified on GitHub (2026-09-23): the job passed on the PR and on `main` with the app-role step logging `f|f` (AC 1–4); the throwaway `chore/p0-7-break-check` branch (expects `prepare` twice) failed the job and was deleted (AC 5); `integration` is a required check on `main` (AC 6); the image pull took ~30 s, well under the ~3 min threshold, so the dev image stays (AC 7). The Postgres readiness wait is folded into the AC 3 role-assertion step, which runs before `db:migrate` and retries until `my_ba_app` can log in over TCP (on a fresh volume the container may report healthy before the init scripts have finished).

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
6. `secrets` is a required status check on `main`, next to `verify` and `integration`.
7. The hook adds < 1 s to a typical commit (it scans staged changes, not the repo).
8. A fresh clone plus `pnpm install` installs the hook with no extra step, apart from installing the gitleaks binary.

**Implemented (2026-09-23).** gitleaks is pinned to 8.30.1 (checksum from the release's `checksums.txt`). The upstream rules already cover AWS, PEM private keys, SendGrid, Cloudflare API keys and Stripe-shaped `sk_(test|live)_` secrets, which also catches Clerk secret keys. So `.gitleaks.toml` adds just one custom rule, `clerk-publishable-key`. HtAG, Domain, Apify, Resend and R2 each get a rule in the ticket that brings that provider in, once its key format has been checked (Brian's call). The Postgres-credentials allowlist also names `.github/workflows/ci.yml`, which holds the same local URLs since P0-7. Both allowlists are path AND regex; no current rule matches either. Hook: `scripts/hooks/gitleaks-staged.sh` via `lefthook.yml` (`gitleaks git --staged`, the v8.30 subcommand). Verified locally against a clone of `main` with the committed config:

- AC 1: full history (25 commits) exits 0, no findings.
- AC 2: the hook blocks a staged `pk_test_` + base64(`example.clerk.accounts.dev$`) (`clerk-publishable-key`), and a `--log-opts base..head` scan of the same commit, made with `--no-verify`, exits 1.
- AC 3: the hook also blocks an `AKIA…` key (`aws-access-token`), an `openssl genrsa` PEM (`private-key`) and a Clerk-shaped `sk_test_…` (`stripe-access-token`).
- AC 4: `pk_test_replace_me`, `sk_test_replace_me` and `postgres:postgres@localhost` staged in an `.env.example` are not flagged.
- AC 5: the log shows `Secret: REDACTED`, and neither the log nor the SARIF report contains the value.
- AC 7: about 0.5 s per commit on a 2-vCPU Linux box, most of it gitleaks' ~0.35 s startup. So the hook has no version preflight: it detects an old binary from its `unknown flag` error instead.

**Verified on GitHub (2026-09-24).** AC 2's CI half (the throwaway branch pushed with `--no-verify` fails `secrets`), AC 5 (Actions log shows `REDACTED`), AC 6 (`secrets` is a required check on `main` alongside `verify` and `integration`) and AC 8 (fresh clone). **P0-8 complete.**

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

**Implemented (2026-09-23).** `lefthook.yml` now has P0-9's jobs next to P0-8's gitleaks. `pre-commit` is `piped`: `format` runs first, then `lint`, `tailwind` and `gitleaks` run as a parallel group. That order stops oxlint reading a file while oxfmt writes it. `pre-push` runs `pnpm typecheck`. `glob_matcher: doublestar` makes `**/*.ts` match root files too. What was checked in the pinned binaries (lefthook 2.1.14, oxfmt 0.68.0, oxlint 1.82.0) rather than assumed:

- Partially staged files (AC 5): lefthook 2.1.14 stashes the unstaged hunks of partially staged files to `.git/info/lefthook-unstaged.patch` before `pre-commit` and restores them afterwards. So `stage_fixed` is safe, and `format` needs no check-only fallback.
- Empty file lists (AC 8): lefthook skips a job whose glob matches no staged file ("no files for inspection"). As a second guard, both oxfmt and oxlint get `--no-error-on-unmatched-pattern`, so a list that is empty after their own ignore rules doesn't fail either.
- Ignored paths (AC 6): oxfmt drops explicit paths that match its ignore rules. The `format` job's `exclude` also mirrors `.oxfmtrc.json` `ignorePatterns`, and `lint`'s mirrors `.oxlintrc.json`. Keep them in sync.
- `pnpm hooks:run` is `lefthook run pre-commit --all-files --no-stage-fixed`, so a manual full run formats but never stages.
- Hooks call `node_modules/.bin/oxfmt` / `oxlint` directly, not through `pnpm exec`, to avoid pnpm's startup cost on every commit.

oxfmt is pinned to exact `0.68.0` (`pnpm-lock.yaml` specifier updated to match). oxlint and lefthook keep caret ranges.

**Verified (2026-09-23).** On macOS, in a throwaway clone: `lefthook validate` passes and AC 1–9 all pass. That includes AC 5 (the unstaged hunk stays out of the commit and is restored in the working tree) and AC 4 (a TS2322 blocks the push, and `pnpm typecheck` shows the same error). **P0-9 complete.**

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

**Implemented (2026-09-24).** Decisions made at build time, each a delta from the description above:

- **Time column:** P0-2 called it `observed_at`, not `timestamp`. It's renamed to `measured_at` anyway, to match D40.
- **`htag_area_id`:** `suburbs.htag_id` is renamed rather than a second column added. The unique index stays per tenant, `(tenant_id, htag_area_id)`, to fit the system-tenant model (D38), not a bare global `unique`. `abs_sal_code` gets a plain index for the P1-10 join.
- **Primary key, not an extra unique index:** the D40 key replaces the old `(suburb_id, metric_name, observed_at)` PK. Keeping the old PK would have made house and unit rows for the same period collide.
- **Compression bracketing (D60):** Timescale won't change a PK or partitioning column while compression is on. So `0010` (custom) removes the policy, truncates the cache and disables compression, `0011` is the drizzle-generated delta, and `0012` (custom) re-enables compression with `segmentby` extended to `property_type, bedrooms`. `0012` also adds `htag_calls` RLS. SQL is kept in `packages/db/sql/`.
- **`source`** keeps P0-2's uppercase `'HTAG'` default, not the ticket's `'htag'`.
- **`htag_calls`:** `analysis_step_id` has no FK, because `analysis_steps` doesn't exist yet; the migration that creates it adds the FK. `task_id` is `ON DELETE SET NULL`, since spend records outlive tasks. `status_code` is nullable, with null meaning no HTTP response. `tier` is a CHECK over `HTAG_TIERS`, and `property_type` a CHECK over `HTAG_PROPERTY_TYPES`. Both vocabularies are owned by `@my-ba/shared` (`domain/htag.ts`) so P1-1 can reuse them.
- **`ScreeningResults` bullet deferred:** the table doesn't exist yet, so the `Ranked` shape is documented by whichever ticket creates it (P1-4).
- **Tests:** `schema.spec.ts` asserts the D40 key and the CHECKs. `htag-data-shape.integration.spec.ts` covers AC 2–4 against the docker DB as `my_ba_app`: the hypertable dimension, the PK order, compression segmentby, the double upsert leaving one row, house and unit as separate rows, and `htag_calls` isolation. Root `pnpm test:integration` now runs the db suite and the orchestrator suite in sequence.

**Verified (2026-09-24).** `pnpm db:migrate` applies 0010–0012 cleanly on the existing P0-2 dev DB (AC 1), and `pnpm test:integration` and `pnpm check` pass (AC 2–4). **P1-0 complete.**

**Ripple for P1-1:** RLS scopes `htag_calls` per tenant, but HtAG's restricted-tier cap is per _account_ (10k rows/month/endpoint, Q13). A cross-tenant monthly usage query can't run as `my_ba_app`. For MVP (one tenant) that doesn't matter; before multi-tenant it needs a system-level rollup (Q18).

### P1-1 — HtAG REST client

**Reference:** `docs/htag/openapi.json` (HtAG Analytics API v2.0.0, OAS 3.1; D61). Each operation's value tier and monthly cap come from its `x-htg-pricingTier` and `x-htg-rate-limit`.

**Description:** New package `packages/htag-client` (`@my-ba/htag-client`): fetch + Zod, no DB dependency. Base URL from `HTAG_BASE_URL` (default `https://api.htagai.com/v1`; `https://api.dev.htagai.com/v1` allowed). `x-api-key` from `HTAG_API_KEY`, server-side only (cl. 36).

| Method                   | Endpoint                       | Value tier                                                                                        | Pagination                                                                            |
| ------------------------ | ------------------------------ | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `queryMarkets(body)`     | `POST /markets/query`          | premium                                                                                           | Single page. Returns `{ rows, truncated }`, `truncated = rows.length === limit` (D42) |
| `summary(params)`        | `GET /markets/summary`         | standard                                                                                          | Auto                                                                                  |
| `trends(metric, params)` | `GET /markets/trends/{metric}` | reference (`price`, `rent`, `yield`); restricted (`stock-on-market`, `days-on-market`, `vacancy`) | Auto                                                                                  |

- `params` = `{ level, areaIds[], propertyTypes?, bedrooms?, periodEndMin?, periodEndMax? }`. `bedrooms` is typed per metric: the spec has no `bedrooms` on SOM, DOM or vacancy. `periodEnd*` only on trends.
- `area_id` is comma-joined (Q13e).
- Auto-pagination: `offset += limit` until a page is shorter than `limit`. `total` is never read (it is the page's row count, D40). Page size from config, default 100 (spec max: 1000 GET, 10000 query).
- Every HTTP attempt (each page, each retry) is reported to an injected `HtagCallRecorder` (D63): endpoint, request params/body (never the key), value tier, status (null on network error), rows returned, and the parsed `X-Billing-*` headers. Cost of record per D62.

**Typed errors** (body shapes from captured fixtures; the spec's `{ error, message }` is wrong for 400/401): `HtagBadRequestError` (400, carries `detail: string` and optional `errors[]` of `{ type, loc, msg, input, ctx }`), `HtagAuthError` (401, body `{ message, hint }`), `HtagBalanceExhaustedError` (402, body `{ error: "payment_required", message, balance }`; returned by any billable endpoint once the free allowance and balance are both empty, not only `/markets/rank`), `HtagQuotaExceededError` (429, carries `Retry-After`, `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`; synthetic fixture), `HtagServerError` (5xx after retries), `HtagNetworkError`. Unknown error bodies are kept raw on the error, never thrown away. No retry on any 4xx. Exponential backoff with jitter on 5xx and network errors, max attempts from config (default 3).

**Zod row schemas** (hand-written against the spec, D61): `PublicMarketQueryRecord` (the 10 allow-listed fields), `MarketSummaryRecord`, `ExternalPriceHistoryOut`, `ExternalRentHistoryOut`, `YieldHistoryOut`, `StockOnMarketTrendRecord`, `DaysOnMarketTrendRecord`, `VacancyTrendRecord`. All metric fields nullable, including those the spec marks non-null. Unknown keys stripped. Observed divergences from the spec, followed by the schemas: the yield trend field is `yield_val` (spec: `yield`); `period_end` is a date on `/markets/query` but a `+00:00` timestamp on summary/trends, so it is normalised to `YYYY-MM-DD`; `confidence` is capitalised (`High` / `Medium` / `Low`) and parsed case-insensitively to lower-case. All rates (`gross_yield`, `vacancy_rate`, `som_percent`, `yield_val`) are fractions (e.g. `0.0168`). Trend pages arrive newest `period_end` first. Boundary normalisation: `dom` `0` → `null` (Q13); `vacancy_rate` `-1` → `null` (HtAG data guide: "cannot be calculated"); `som` / `som_percent` `0` kept (valid: no new listings).

**Schema delta — `htag_calls` (D62):** add `billed_units integer null`, `billing_balance_aud numeric(12,4) null`, `billing_tier text null` (CHECK `free | tier1 | tier2 | tier3`), `cost_source text not null default 'none'` (CHECK `header | config_estimate | none`). `tier` keeps meaning the endpoint's value tier. Drizzle-generated migration; D60 does not apply (`htag_calls` is not the hypertable). Vocabularies `HTAG_BILLING_TIERS` and `HTAG_COST_SOURCES` added to `@my-ba/shared` `domain/htag.ts`.

**Recorder (D63):** `HtagCallRecorder` interface in `@my-ba/shared`; `createHtagCallRecorder(db, { tenantId, taskId?, analysisStepId? })` in `@my-ba/db`; `InMemoryHtagCallRecorder` in the client's test utilities.

**Fixtures:** captured by `scripts/htag/capture-fixtures.sh` (run locally, key from env, ≈ AUD $2.50) into `packages/htag-client/test/fixtures/`. Each fixture is `{ name, synthetic, request, status, headers, body }` with response headers verbatim. 429, 5xx and pagination fixtures are hand-written or derived from captured rows and marked `"synthetic": true`. First capture (2026-09-30) ran entirely on the free allowance (`X-Billing-Cost: 0`, `X-Billing-Tier: free`, balance 0); `trends-days-on-market` returned 402, which became the 402 fixture. A DOM 200 and a non-zero-cost fixture need one re-run after a balance top-up.

**Acceptance criteria:**

1. Contract tests run against fixtures only. No live key in CI; `HTAG_API_KEY` absent from the test env.
2. Each Zod row schema's key set equals the property set of its spec component in `docs/htag/openapi.json`, modulo an explicit divergence map in the test (currently `yield` → `yield_val`), so a re-downloaded spec that changes shape fails loudly. Every captured fixture body parses.
3. Pagination: `trends` over pages of 100, 100, 37 returns 237 rows in 3 requests, stops on the short page, and ignores a deliberately wrong `total`.
4. `queryMarkets`: rows == `limit` → `truncated: true`; fewer → `false`; always exactly one request.
5. Each error class raised from a fixture of its status. 400 carries `detail` (and `errors[]` for validation failures); 402 carries `balance`; 429 carries the rate-limit headers. 4xx is not retried (one recorder call); 5xx is retried to max attempts (one recorder call per attempt).
6. One row failing Zod is logged and skipped; `invalidRowCount` returned; the batch does not throw.
7. Normalisation: `dom: 0` → `null`, `vacancy_rate: -1` → `null`, `som_percent: 0` stays `0`, timestamp `period_end` → date, `confidence` lower-cased.
8. Cost (D62): 2xx with headers → `cost_aud` = `X-Billing-Cost`, `cost_source = 'header'`, `billed_units` / `billing_balance_aud` / `billing_tier` set. 2xx without headers → rows × configured rate for the value tier, `cost_source = 'config_estimate'`, warning logged. Non-2xx or network error → `cost_aud = 0`, `cost_source = 'none'`.
9. Recorder (Postgres, integration, as `my_ba_app`): rows land tenant-scoped under RLS; a row survives the caller's transaction rolling back; a recorder that throws is logged at error level and the client still returns the data (D63).
10. Migration generated from the Drizzle schema, applies cleanly on the existing dev DB; `schema.spec.ts` asserts the new CHECKs.
11. `apps/web` references neither `HTAG_API_KEY` nor `@my-ba/htag-client` (check in `pnpm lint`). gitleaks passes with fixtures committed.
12. README Status updated.

**Dependencies:** P0-1, P1-0. **Risk:** low–medium (fixture capture needs one local run; 402 shape unverified).

**Implemented (2026-09-30).** Deltas from the description above:

- **Fixtures:** the funded re-run captured every endpoint, including a billed DOM call (`X-Billing-Cost: 0.666` = 3 × $0.222, `X-Billing-Tier: tier1`). It overwrote the unfunded run's 402, so that body lives on as `test/fixtures/synthetic/trends-days-on-market-402.json`, verbatim. 429 and 5xx are synthetic. The free allowance is per endpoint (`X-Billing-Free-Remaining` differs by endpoint), so config estimates ignore it and err high.
- **Row field names stay HtAG's** (`typical_price`, `yield_val`, …), not camelCase, so P1-4 can map them to `metric_name` one-to-one.
- **`property_type` is sent as repeated params** (`property_type=house&property_type=unit`); `area_id` is comma-joined (Q13e). Multi-value `property_type` is unverified live; every fixture uses one value.
- **Two extra error classes:** `HtagUnexpectedStatusError` (other 4xx, not retried) and `HtagResponseError` (2xx with a body that isn't `{ results }`; still billed and recorded). Pagination also has a `maxPages` safety stop (default 1000).
- **`InMemoryHtagCallRecorder` is exported** from the package, for P1-4's tests.
- **Migration `0013`** (drizzle-generated): the four `htag_calls` columns and three CHECKs. A plain delta; D60 does not apply.
- **Tests:** `src/client.spec.ts` (AC 1, 3–9), `src/spec-contract.spec.ts` (AC 2: key sets vs spec with the `yield` → `yield_val` divergence map, tiers vs `x-htg-pricingTier`, every 2xx fixture parses), `src/config.spec.ts`; `@my-ba/shared` `htag-call.spec.ts`; `@my-ba/db` `htag-call-recorder.integration.spec.ts` (AC 9: RLS, survives caller rollback, network-error row) and `schema.spec.ts` (AC 10 CHECKs). AC 11: `scripts/check-web-htag-boundary.mjs` in `pnpm lint`.
- **Pre-verification run (Claude, 2026-09-30):** `tsc` clean for `@my-ba/shared`, `@my-ba/db` (including the integration spec) and `@my-ba/htag-client` (src + specs). The 65 client specs and 4 shared specs pass under Node's test runner with a Vitest-compatible shim (Vitest itself couldn't run in that environment).
- **gitleaks:** `htag-api-key` rule added to `.gitleaks.toml` (`sk-org-` + 60–100 base64url chars), from a real portal-issued key's format. Regex checked against same-shape random strings: catches dotenv, quoted, header and JSON forms; ignores empty placeholders, prose mentions and OpenAI `sk-proj-` keys.

**Verified (2026-10-01, Brian).** `pnpm db:migrate` applies `0013` cleanly on the existing dev DB (AC 10). `pnpm check` passes: typecheck, lint including `check-web-htag-boundary` (AC 11), format, and the Vitest suites for `@my-ba/htag-client`, `@my-ba/shared` and `@my-ba/db` (AC 1–8, 10). `pnpm test:integration` passes, including `htag-call-recorder.integration.spec.ts` (AC 9). `pnpm secrets:scan` and the pre-commit gitleaks run are clean with the `htag-api-key` rule (AC 11). **P1-1 complete.**

### P1-2 — _Retired_

Folded into P1-4 (on-demand trend hydration). The scheduled national refresh worker is no longer needed (D27 superseded by D40/D42). ID not reused.

### P1-3 — Investor profile + criteria schema + form

**Description:** `CriteriaSchema` (Zod) in `packages/shared`, saved to `purchase_tasks.criteria_json`, compiled to HtAG `logic` by pure `compileToHtagLogic`. Next.js 3-step form (React Hook Form + Zod resolver):

1. **Strategy & risk** — strategy (growth / cashflow / balanced), risk (low / medium / high), task name, target states, property type. Selecting both prefills filters and weights from the preset (P1-8).
2. **Criteria** — toggleable filters: typical price range, gross yield % range, vacancy rate % max, stock on market % max, days on market max, 36-month price growth % max (compiled to a 3-year CAGR, D68), annual sales volume min, IRSAD decile min, high-confidence-only (default on). Collapsible "Customise ranking weights" panel (sliders, normalised to 1 on save).
3. **Review** — criteria + profile summary, preset badge (with "custom" flags), estimated HtAG cost ceiling, "Create Task & Run Screening" / "Save as Draft".

Profile block: `{ strategy, risk, presetVersion, weights, weightsCustomised, filtersCustomised }`. Percent inputs converted to fractions in `compileToHtagLogic`, not in the form.

**Acceptance criteria:**

1. `CriteriaSchema` rejects inverted ranges, empty `states`, unknown keys, and invalid weights (P1-8 `Weights`).
2. `compileToHtagLogic` snapshot-tested: every filter, percent→fraction scaling, all filters off (bedrooms + state + confidence leaves only).
3. Editing any preset-prefilled filter sets `filtersCustomised`; editing any weight sets `weightsCustomised`. Switching preset after edits requires confirmation.
4. **Before merge:** zero-cost probe of `state` field (`typical_price gte 999999999` + `state in ["QLD"]`). If rejected, record in Q16 and remove the leaf (state filtering then handled by a verified field or area-ID scoping — never by post-truncation local filtering).
5. **Before merge:** manual check of `vacancy_rate` units; record finding in PR and Q16. Zero-cost probe of `price_3y_cagr` as a `logic` field (`typical_price gte 999999999` + `price_3y_cagr lte 0.1447`); if rejected, use the `price_3y_cagr_max` request field and record the D42 exception (D68).
6. Draft saves with partial criteria; "Run" requires full parse.
7. Clone (Phase 3) opens this form pre-filled from the source task's profile — form accepts an initial `Criteria` value.

**Dependencies:** P1-1 (types), P1-8. **Risk:** medium (unverified `state` field, vacancy units).

### P1-4 — Suburb Screener node

**Description:** LangGraph node. Steps:

1. Compile criteria → `POST /markets/query`, `limit` from config (`SCREEN_QUERY_LIMIT`, default 100).
2. If returned == limit → `interrupt({ type: 'SCREENING_TOO_BROAD', criteria, returned })`. No further calls.
3. Upsert returned areas into `Suburbs` (by `htag_area_id`).
4. Hydrate Reference-tier `trends/price` (37 points, for 36-month growth — D68), `trends/rent` (13, for 12-month growth), `trends/yield` (1) for survivors via comma-list batches with `period_end_min`; reuse cached rows already in `SuburbMetricsTS` (D40).
5. Join ABS renter proportion (P1-10) where available.
6. Build `RawMetrics[]` → `rankSuburbs(metrics, criteria.profile.weights, { disabledFactors })` (P1-8).
7. Restricted hydration: `trends/stock-on-market`, `trends/days-on-market`, `trends/vacancy` latest period for top N (`SCREEN_RESTRICTED_TOP_N`, default 6). Trend-direction flags and long-term factors on this shortlist are Q21.
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

**Description:** `packages/domain/src/ranking/` (`@my-ba/domain`) — `presets.ts` (`Strategy`, `RiskTolerance`, `FactorId`, `Weights`, `PRESET_VERSION`, `presetWeights`, preset filter defaults) and `rank.ts` (`RawMetrics`, `rankSuburbs`, `percentileRanks`). No I/O, no LLM, no HtAG proprietary scores (D39, D44). Factors and presets per D68 (amends D17/D44), filters per D19/D68:

| Strategy | Base weights                                                                     | Filter defaults |
| -------- | -------------------------------------------------------------------------------- | --------------- |
| Growth   | rent_growth_12m 0.35 · price_growth_36m 0.30 · renter_band 0.20 · yield_now 0.15 | —               |
| Cashflow | yield_now 0.50 · rent_growth_12m 0.30 · renter_band 0.15 · price_growth_36m 0.05 | yield ≥ 4.5%    |
| Balanced | yield_now 0.30 · rent_growth_12m 0.30 · price_growth_36m 0.25 · renter_band 0.15 | yield ≥ 3.5%    |

| Risk   | low_volatility weight (base scaled by 1 − w) | Filter defaults                                                                                          |
| ------ | -------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Low    | 0.25                                         | confidence High · IRSAD ≥ 5 · vacancy ≤ 1.5% · SOM ≤ 1.3% · DOM ≤ 50 · 36m growth ≤ 50% · sales ≥ 100/yr |
| Medium | 0.10                                         | confidence High · IRSAD ≥ 3 · vacancy ≤ 2.5% · SOM ≤ 1.3% · DOM ≤ 65 · 36m growth ≤ 50% · sales ≥ 50/yr  |
| High   | 0                                            | confidence any · vacancy ≤ 4% · SOM ≤ 2% · DOM ≤ 90 · sales ≥ 20/yr                                      |

**Acceptance criteria:**

1. `presetWeights` sums to 1 (±1e-9) for all 9 combinations; snapshot-tested.
2. `percentileRanks` handles ties (average rank), n = 1 (0.5), all-undefined.
3. Disabled factor → remaining weights renormalise; coverage not penalised. `renter_band` and `price_growth_36m` use D68's absolute curves (band, ceiling), not percentiles.
4. Coverage < 50% → `insufficientData`, sorted below all sufficient suburbs.
5. Deterministic tie-break on `areaId`; stable output across runs.
6. `Weights` rejects all-zero, unknown or missing keys, and vectors not summing to 1 (the renter/owner exclusivity rule retired with D68).
7. Test asserts `RawMetrics` contains no RCS/Dex/GRC or other HtAG-proprietary fields.

**Dependencies:** none. **Risk:** low.

**Implemented (2026-10-01).** Built ahead of P1-3, which depends on it. Deltas from the description above:

- **Package:** `packages/domain` didn't exist; it is now `@my-ba/domain` (D67), a pure package (Zod only, no I/O, env, DB or LLM), same build shape as `@my-ba/shared` (CJS `dist`). Files: `src/ranking/presets.ts`, `src/ranking/rank.ts`.
- **`RawMetrics` is factor-level, not series-level:** `{ areaId, yieldNow, rentGrowth12m, priceGrowth36m, renterProportion, priceVolatility }`, each nullish. Deriving growth and volatility from HtAG trend rows is P1-4's job (it owns the < 18-points rule too). `rawMetricsSchema` is strict, so an HtAG proprietary field is rejected at the boundary (AC 7).
- **Reworked to D68 before verification:** factor set, band / ceiling scoring (`FACTOR_SCORING`, `RANKING_TARGETS`, `bandScore`, `ceilingScore`), weights and filter defaults as in the tables above.
- **`Weights` is stored normalised:** strict, all five factors, each in [0, 1], sum = 1 ± 1e-6. `normaliseWeights()` is exported for P1-3's sliders ("normalised to 1 on save").
- **Preset filter defaults** are `presetFilterDefaults(strategy, risk)` → `{ minGrossYieldPct?, maxVacancyRatePct?, maxStockOnMarketPct?, maxDaysOnMarket?, maxPriceGrowth36mPct?, minAnnualSalesVolume?, minIrsadDecile?, confidence: "high" | "any" }`, in percent as the investor types them (P1-3's compiler converts to fractions). `minIrsadDecile` keeps the roadmap's wording; HtAG `irsad` units are confirmed in P1-3.
- **`PRESET_VERSION`** = `"2026-10-01.v1"`.
- **`Ranked`** = `{ areaId, rank, score, coverage, insufficientData, breakdown }`. `breakdown` has every factor: `{ method: percentile | band | ceiling, raw, factorScore, weight, contribution, status: used | missing | disabled | zero_weight }`. `weight` is the effective (renormalised) weight; contributions sum to `score`. `score` is `null` when coverage is 0. Semantics recorded in D67.
- **Errors:** `rankSuburbs` throws on invalid weights or metrics, duplicate `areaId`, or when every weighted factor is disabled. An empty survivor set returns `[]`.
- **Tests:** `presets.spec.ts` (AC 1 incl. a snapshot of all 9 vectors, AC 6, filter defaults) and `rank.spec.ts` (AC 2–5, 7). **Pre-verification run (Claude, 2026-10-01):** `tsc` clean for src and specs; all 43 specs pass under Node's test runner with a Vitest-compatible shim (Vitest's native rollup binary doesn't run in that environment). The snapshot file is not committed yet: the first local `vitest run` writes it, and CI fails on a missing snapshot.

**Verified (2026-10-01, Brian).** Code reviewed; `pnpm check` passes (typecheck, lint, format, and the `@my-ba/domain` Vitest suites with the presets snapshot regenerated for D68, AC 1–7). **P1-8 complete.**

**Follow-up (2026-10-01, review).** Outbound boundary: `factorBreakdownSchema`, `rankedSchema` and `rankedListSchema` (Zod) now define `FactorBreakdown` and `Ranked` (types inferred), and `rankSuburbs` parses its result before returning. The schemas are strict and enforce the invariants: `breakdown` exhaustive over `FACTOR_IDS`; status agrees with `factorScore` / `weight` / `contribution`; `insufficientData` ⇔ coverage < 0.5; `score` null ⇔ coverage 0; coverage = sum of used weights; contributions sum to `score`; ranks 1..n. Float slack 1e-9 (`RANKED_FLOAT_TOLERANCE`). P1-4 can reuse `rankedSchema` to parse `score_breakdown_json` on read. 49 specs pass under the Node shim; needs your `pnpm check`.

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
