# my-ba.ai — agent guide

SaaS that automates suburb selection and agent outreach for Australian
investment property purchases. Product and architecture docs are in [`docs/`](./docs);
[`docs/04-decisions-log.md`](./docs/04-decisions-log.md) is the living document and
the first thing to read before proposing anything architectural.

## Repo shape

| Path              | What it is                                                                           |
| ----------------- | ------------------------------------------------------------------------------------ |
| `apps/api`        | NestJS 11 — REST + BFF. HTTP, auth, tenant routing.                                  |
| `apps/web`        | Next.js 16 App Router + Tailwind v4. Has its own `AGENTS.md`.                        |
| `apps/worker`     | NestJS standalone context — BullMQ processors. Scales independently of the API.      |
| `packages/db`     | Drizzle schema, migrations, pool factory, tenant-scoped transaction wrapper.         |
| `packages/shared` | Zod schemas, domain types, queue names. The contract all three apps compile against. |
| `packages/domain` | Pure domain logic (Zod only, no I/O). Ranking presets and `rankSuburbs` (P1-8).      |
| `packages/config` | Shared tsconfig presets: `base` / `lib` / `nest` / `next`.                           |

## Rules that are not negotiable

- **Never write a secret, key, token or credential into any tracked file.** Not
  real, not "test", not a format-valid dummy, not "just public". See
  [Secrets and credentials](#secrets-and-credentials) below. This rule outranks
  "make CI green".

- **Never import across workspace boundaries by relative path.** `packages/shared`
  compiles to `dist` and apps depend on its `build`. Import `@my-ba/shared`, never
  `../../packages/shared/src`. Turbo orders the graph; a relative import silently
  breaks it.
- **`tenant_id` on every table, from day one** (D26). There is one user today and
  this is still not optional. Retrofitting it is the expensive version. A Vitest
  case in `packages/db` fails CI if a table is added without it.
- **Never connect the app as `postgres`** (D40). Superusers bypass row-level
  security unconditionally, so a superuser connection makes every policy in the
  schema inert — and with one tenant in the database, nothing looks wrong.
  Apps use `DATABASE_URL` (`my_ba_app`); migrations use `DATABASE_MIGRATION_URL`.
- **DI tokens live in a `*.tokens.ts` file, never on the module that provides
  them.** A provider declared by a module must not import that module to get its
  token — Node hands one side a half-initialised namespace and Nest reports a
  `CircularDependencyException` at boot, naming the module rather than the
  import. See `auth/auth.tokens.ts` and `database/database.tokens.ts`. Unit tests
  do not catch this; they construct services directly and never build the module graph.
- **The tenant comes from the token, never from the request** (D45). The guard
  resolves it by looking the Clerk id up in `users` and puts it on `request.auth`.
  A header, query parameter or body field naming a tenant is not consulted and
  must never be. Handlers reach the database through `TenantDatabaseService.run(auth, fn)`.
- **`withAuthLookup()` is for exactly one query** (D46) — resolving a verified
  Clerk id to its tenant, before a tenant exists to scope by. It sets
  `app.bootstrap_auth_id`, and the policy it relies on is `FOR SELECT` only. Do
  not reach for it anywhere else; everything after resolution is `withTenant`.
- **Every query runs inside `withTenant()`** (`packages/db/src/tenant.ts`), which
  sets `app.tenant_id` transaction-locally. Outside it the app role sees an empty
  database. That is the design: a query that forgets its tenant returns nothing
  rather than everything. One exception: `suburb_metrics_ts` has no RLS, because
  TimescaleDB does not support it on compressed chunks (D43). A CHECK constraint
  pins that table to the system tenant instead — do not drop it.
- **Every job payload extends `tenantJobSchema`** (D49). The producer stamps the
  tenant from the `AuthContext`; the processor parses before doing anything and
  runs its queries through `withTenant(payload.tenantId)`. A payload that fails
  to parse throws `UnrecoverableError` — retrying will not make it valid.
  Register a queue (in both apps) in the ticket that adds its processor, not
  before; queue names live in `QUEUE_NAMES`.
- **Zod at every boundary, inbound and outbound.** Parse, don't cast. The health
  endpoint parses its own response on the way out — follow that pattern.
- **TypeScript strict**, plus `noUncheckedIndexedAccess`, `noUnusedLocals`,
  `noUnusedParameters`. Do not loosen a tsconfig to make an error go away.
- **Filenames kebab-case**, enforced by Oxlint.
- **Don't relitigate a LOCKED decision** in `docs/04-decisions-log.md` without
  saying explicitly that you are doing so, and why.

## Secrets and credentials

This applies to every agent and every file git tracks: source, tests, fixtures,
workflows, Dockerfiles, docs, READMEs, commit messages and PR descriptions.

**Never write any of these as a literal:**

- API keys and tokens of any provider or prefix — Clerk `pk_*`/`sk_*`, HtAG,
  Domain, Apify, Resend/SendGrid, Cloudflare R2, GitHub, AWS, etc.
- Placeholders shaped like a real key — a dummy that passes a provider's format
  check (e.g. `pk_test_` + base64) is still a key-shaped literal and is banned.
  "The publishable key is public by design" does not make it OK to commit.
- Connection strings with passwords for any non-local host, private keys,
  certificates, JWTs, webhook signing secrets, session cookies.
- Values copied from `.env`, `.env.local`, a dashboard, terminal output or chat.

**Where values go instead:**

| Context        | Mechanism                                                                                       |
| -------------- | ----------------------------------------------------------------------------------------------- |
| Local dev      | `.env` / `.env.local` (gitignored). Never read them aloud into code, docs or chat.              |
| CI             | `${{ vars.NAME }}` (public config) or `${{ secrets.NAME }}` (anything sensitive). Never inline. |
| Deployed envs  | The host's secret store (Railway/Render), later GitHub Environments per stage.                  |
| Tests          | Read from env; skip or fail with a clear message when absent. Mock the provider, not the key.   |
| `.env.example` | Variable **names** with obvious non-functional placeholders only: `pk_test_replace_me`.         |

**The only literals allowed** are the local docker-compose credentials that
already exist (`postgres:postgres`, `my_ba_app:app` on `localhost`). They
unlock nothing outside a developer's own machine. Don't add new ones.

**When a build or test fails because a value is missing:**

1. Don't hardcode it to get past the failure, even temporarily or "for CI only".
2. Wire the code or workflow to read it from env/`vars`/`secrets`, and add a
   fail-fast check that names the missing variable and where to set it.
3. Tell the user exactly which variable to create and where (e.g. _Settings →
   Secrets and variables → Actions_). Creating it is their step, not yours.

**If you notice a secret already committed** — in the working tree or git
history — stop and tell the user. Don't try to "fix" it by editing the file
alone: the value has to be rotated at the provider, and history rewriting is the
user's call.

**Before you finish any change**, check your own diff for key-shaped strings:

```bash
git diff | grep -nE '(pk|sk|rk)_(test|live)_|AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{20,}|-----BEGIN .*PRIVATE KEY|xox[abpr]-|eyJ[A-Za-z0-9_-]{10,}\.'
```

Anything it prints is either removed or explicitly approved by the user.

**This is enforced mechanically (P0-8, D60).** [gitleaks](https://github.com/gitleaks/gitleaks)
runs in two places with the same `.gitleaks.toml`:

- A lefthook `pre-commit` hook scans the staged changes. It is installed by
  `pnpm install` and fails if the `gitleaks` binary is missing
  (`brew install gitleaks`).
- The `secrets` CI job scans the PR's commits (the full history on `main`) and
  is a required check. CI is the gate; the hook only catches it sooner.

`git commit --no-verify` and `LEFTHOOK=0` are not agent options. If the hook
blocks a commit, remove the value and follow the steps above. Don't route
around the hook.

**The same rule covers every git hook (P0-9).** `pre-commit` also formats
(oxfmt, re-staged), lints (oxlint) and runs the Tailwind check on the staged
files; `pre-push` runs `pnpm typecheck`. Never skip them with `--no-verify`,
`LEFTHOOK=0` or `git push --no-verify`. If a hook fails, fix the cause
(`pnpm format`, the lint error, the type error) and commit again. Don't
disable a rule, widen a hook's `exclude` or edit `lefthook.yml` to get a commit
through; that is a change to propose to the user.

**Allowlisting a false positive** is the user's call, never an agent's quiet
fix. Propose it as its own PR that changes only `.gitleaks.toml` and says why
the match is not a secret. Scope every entry to a path _and_ a regex
(`condition = "AND"`). Never allowlist a whole file, a directory or a rule, and
never use inline `gitleaks:allow` comments. A real secret is never allowlisted:
it is rotated at the provider first.

New providers get a custom rule in `.gitleaks.toml` in the ticket that brings
them in, and only after the key format has been checked in the provider's
dashboard or docs. Today Clerk's publishable key and the HtAG API key (`sk-org-…`) have one; Clerk secret
keys are already caught by the upstream `stripe-access-token` rule.

## Commands

```bash
pnpm install
pnpm build        # shared builds first; run once before typecheck on a clean clone
pnpm dev          # api :3001, web :3000, worker (no HTTP)
pnpm check        # typecheck + lint + format:check + test — what CI runs

pnpm db:up        # Postgres (TimescaleDB + pgvector) and Redis in docker
pnpm db:generate  # schema change -> new migration (never hand-write CREATE TABLE)
pnpm db:migrate   # apply migrations. Explicit, never on app startup (D39)
```

The API refuses to boot without `CLERK_JWT_KEY` or `CLERK_SECRET_KEY` (see
`apps/api/.env.example`), and both API and worker refuse to boot without
`REDIS_URL`. There is deliberately no flag that turns the guard off,
because a flag that turns the guard off can be set in the wrong environment.

`pnpm db:bootstrap` is a one-time command that created the initial migration
set. It is a no-op once `packages/db/drizzle/meta/_journal.json` exists.

Extensions, `create_hypertable`, compression policies and RLS cannot be
expressed in Drizzle's schema DSL. Those live as `--custom` migrations filled
from `packages/db/sql/` (D42) — everything else comes from `db:generate`.

Lint is Oxlint, format is oxfmt, tests are Vitest everywhere. There is no ESLint
and no Prettier in this repo; do not add them. Type-level checking is `tsc --noEmit`
via `pnpm typecheck`, deliberately not the linter's job (D34).

The Nest apps compile to CommonJS with decorator metadata. Vitest transforms them
through SWC because esbuild does not emit that metadata — if you add a Nest app,
copy `apps/api/vitest.config.ts` rather than writing a fresh one.

## When a ticket is done

A ticket isn't finished until the docs that describe project state agree with
the code. In the same change that completes it, update all of these:

1. `README.md` → **Status**: add the ticket as complete (one line on what landed)
   and correct "Next up". Also update **Layout**, **Getting started** and
   **Scripts** if the ticket added a package, an env file or a command.
2. `docs/05-roadmap-and-phases.md`: mark the ticket **Done.**
3. `AGENTS.md` → **Where things are going**: the done list and what's next.
4. `docs/04-decisions-log.md`: any decision the ticket settled (e.g.
   PROVISIONAL → LOCKED) plus a changelog row.

Only mark a ticket done once its acceptance criteria were actually verified —
say how (test name, command, who ran it). If verification is still pending,
say that instead.

## Where things are going

Phase order and ticket acceptance criteria are in `docs/05-roadmap-and-phases.md`.
P0-1 (scaffold), P0-2 (database), P0-3 (auth), P0-4 (Redis + BullMQ) and P0-5
(LangGraph.js durable-interrupt spike) are done; the P0-5 gate passed, so D22 is
LOCKED and Phase 1 is unblocked. P0-6 (Next.js shell) is implemented and
awaiting verification. P0-7 is done: the CI `integration` job runs the P0-5
durability suite and is a required check on `main`. P0-8 (gitleaks secret
scanning in CI + pre-commit) is implemented and awaiting verification on
GitHub. Phase 1: P1-0 (HtAG schema delta) is done; P1-1 (HtAG REST client,
`packages/htag-client`) is done. P1-8 (ranking) is next.

HtAG calls go through `@my-ba/htag-client` only, and only from the API or
worker: the key is server-side (T&C cl. 36) and `pnpm lint` fails if `apps/web`
mentions `HTAG_API_KEY` or the package. Every client needs an
`HtagCallRecorder` (D63) — in app code that is `createHtagCallRecorder(db, {
tenantId, taskId, analysisStepId })` from `@my-ba/db`, never a no-op.
`docs/htag/openapi.json` is the contract (D61); where captured fixtures disagree
with it, the fixtures win and the divergence goes in the P1-1 ticket.

Every web route is behind a session unless it is added to the public matcher in
`apps/web/src/proxy.ts` (D58). API reads rely on RLS alone, with no explicit
`tenant_id` predicate, and another tenant's row is a 404 (D57).
Keep the orchestrator behind the narrow `Orchestrator` interface in
`packages/orchestrator/src/stage.ts` (`runStage({ tenantId, taskId, stage }) -> StageResult`)
so it stays swappable. Never import `@langchain/*` outside that package.

LangGraph checkpoints live in the `langgraph` schema, outside RLS (D51). Tenant scope
is in the thread id — always build it with `threadIdFor`. A node that calls
`interrupt()` re-executes from the top on resume: keep side effects out of it or
before it in a separate node. `pnpm test:integration` is the P0-5 durability suite
and needs `pnpm db:up && pnpm db:migrate`. CI runs it in the `integration` job, as
`my_ba_app` against a freshly migrated database — don't make it pass by
connecting as `postgres` or by adding retries to a flaky SIGKILL case.
