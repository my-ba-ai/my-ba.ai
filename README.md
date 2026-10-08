# my-ba.ai

Automates the suburb-selection and agent-outreach workflow for Australian
investment property purchases. Product and architecture docs live in [`docs/`](./docs);
[`docs/04-decisions-log.md`](./docs/04-decisions-log.md) is the living document.

## Layout

```
apps/
  api/        NestJS 11 — REST + BFF. Owns HTTP, auth, tenant routing.
  web/        Next.js 16 App Router + Tailwind v4.
  worker/     NestJS standalone context — BullMQ processors. Scales separately.
packages/
  shared/     Zod schemas, domain types, queue names. The contract between all three apps.
  db/         Drizzle schema, migrations, pool factory, tenant-scoped transactions.
  orchestrator/ Stage orchestration behind the `Orchestrator` interface (LangGraph.js + PostgresSaver).
  htag-client/ HtAG REST client: fetch + Zod, spend reported via an injected recorder (D63). Server-side only.
  config/     Shared tsconfig presets (base / lib / nest / next).
```

`packages/shared` compiles to `dist` and every app depends on its `build`, so
`turbo` orders the graph for you — never import from `../../packages/shared/src`.

## Prerequisites

- Node 22.12+ (`.nvmrc` pins the version used here)
- pnpm 10+ — `corepack enable && corepack prepare pnpm@10.28.0 --activate`
- Docker, for local Postgres and Redis

## Getting started

```bash
brew install gitleaks   # the pre-commit hook needs it and fails without it (P0-8)
pnpm install        # also installs the git hooks (lefthook), see below
pnpm build          # shared must build before the apps typecheck

cp packages/db/.env.example packages/db/.env
cp packages/orchestrator/.env.example packages/orchestrator/.env
cp apps/api/.env.example apps/api/.env
cp apps/worker/.env.example apps/worker/.env
cp apps/web/.env.example apps/web/.env.local   # then put your Clerk dev keys in it (P0-3)
                    # and restrict sign-ups in the Clerk dashboard: there is no sign-up route (D58)

pnpm db:up          # Postgres 17 + TimescaleDB + pgvector on :5432, Redis on :6379
pnpm db:migrate     # Drizzle migrations, then the LangGraph checkpointer tables

pnpm dev            # api :3001, web :3000, worker (no HTTP)
```

Check it landed:

```bash
curl -s localhost:3001/api/health/db
# {"status":"ok","extensions":{"timescaledb":"…","vector":"…"},"rlsEnforced":true,…}
```

`rlsEnforced: false` means the API is connected as a superuser and every
tenant policy in the schema is doing nothing (D40).

### Git hooks

`pnpm install` installs them through lefthook (`lefthook.yml`). They surface
CI failures early; CI stays the gate.

- **pre-commit**, on staged files only: `oxfmt` formats them and re-stages the
  result, then `oxlint` (errors block, warnings don't), the Tailwind
  canonical-class check (only when `apps/web/src` is staged) and gitleaks run
  in parallel. Unstaged hunks of a partially staged file are stashed for the
  hook, so they never end up in the commit.
- **pre-push**: `pnpm typecheck`.

`pnpm hooks:run` runs the pre-commit checks over every file without staging
anything.

### Browsing the database (pgAdmin)

```bash
pnpm db:admin       # then open http://localhost:5050
```

Two servers are pre-registered under "my-ba local"; pgAdmin asks for the
password on first connect (the dev passwords in `docker-compose.yml`).

- **postgres (owner)** bypasses RLS: every tenant's rows. Use this to browse.
- **my_ba_app** is the app role, so RLS applies and tables look empty until a
  tenant is set. "View/Edit Data" opens its own connection, so set the tenant
  in the Query Tool, in the same transaction as the query:

  ```sql
  begin;
  select set_config('app.tenant_id', '00000000-0000-0000-0000-000000000000', true); -- system tenant
  select * from abs_sal_tenure limit 20;
  commit;
  ```

The server list is imported only on pgAdmin's first start. After editing
`packages/db/pgadmin-servers.json`, reset it with
`docker compose --profile tools down && docker volume rm $(docker volume ls -q --filter name=pgadmin-data)`
(only pgAdmin's volume; never `down -v`, which also drops Postgres).

## Scripts

| Command                  | What it does                                                                  |
| ------------------------ | ----------------------------------------------------------------------------- |
| `pnpm dev`               | All three apps in watch mode                                                  |
| `pnpm build`             | Turbo build, respecting the dependency graph                                  |
| `pnpm typecheck`         | `tsc --noEmit` across every workspace                                         |
| `pnpm lint`              | Oxlint, Tailwind canonical check, HtAG-stays-server-side check (P1-1)         |
| `pnpm format`            | oxfmt (write); `pnpm format:check` in CI                                      |
| `pnpm test`              | Vitest across every workspace                                                 |
| `pnpm check`             | typecheck + lint + format:check + test — CI `verify` job                      |
| `pnpm db:up` / `db:down` | Local Postgres + Redis via docker compose                                     |
| `pnpm db:generate`       | Schema change → migration. Never hand-write `CREATE TABLE`                    |
| `pnpm db:migrate`        | Drizzle migrations + `PostgresSaver.setup()` (D39, D51)                       |
| `pnpm test:integration`  | P0-5 durability suite (CI `integration` job). Needs `db:up` + `db:migrate`    |
| `pnpm db:studio`         | Drizzle Studio against the local database                                     |
| `pnpm db:admin`          | pgAdmin on http://localhost:5050 (opt-in `tools` profile; `db:down` stops it) |
| `pnpm secrets:scan`      | gitleaks over the full git history, as CI's `secrets` job does on `main`      |
| `pnpm hooks:run`         | The pre-commit hook over every file. Formats, but stages nothing              |

## Conventions

- TypeScript strict, plus `noUncheckedIndexedAccess` and no unused locals/params.
- Zod at every boundary, including outbound responses.
- Filenames kebab-case (enforced by Oxlint).
- Nest apps compile to CommonJS with decorator metadata; Vitest transforms them
  through SWC because esbuild does not emit that metadata.

## Status

Phase 0 — Foundation:

- **P0-1 complete:** scaffold, three apps booting, shared contract, CI.
- **P0-2 complete:** Postgres + TimescaleDB + pgvector, Drizzle schema for
  tenants / users / purchase tasks / suburbs, a `suburb_metrics_ts` hypertable
  with a compression policy, RLS enforced against a non-superuser application role.
- **P0-3 complete:** Clerk auth. JWT guard in NestJS, tenant-per-user resolved
  from the token with just-in-time provisioning, sign-in in `apps/web`.
- **P0-4 complete:** Redis + BullMQ. `diagnostics` queue from API to worker, Bull
  Board (dev only), `GET /api/health/redis`, identity cache in Redis.
- **P0-5 complete:** LangGraph.js HITL spike passed — a run pauses at
  `interrupt()`, survives `SIGKILL`, and resumes from its Postgres checkpoint in
  a fresh process with state intact (`pnpm test:integration`). D22 is now
  LOCKED; Phase 1 is unblocked.

- **P0-5.5 complete:** UI foundation. 24 shadcn primitives on Base UI in
  `apps/web/src/components/ui/`, design-system tokens in `globals.css` (light only,
  D54), Manrope (D55), react-hook-form + Zod, TanStack Table.
  Everything is rendered at [`/dev/ui`](http://localhost:3000/dev/ui) in dev.
  The Base UI Combobox/Slider spike passed all 8 keyboard checks, so D52 is
  LOCKED. Re-run that checklist after any `@base-ui/react` upgrade.

- **P0-6 complete:** Next.js shell. Deny-by-default
  route protection in `proxy.ts` (only `/sign-in` is public), sidebar/header
  layout with unbuilt sections disabled and labelled by phase, `/tasks` backed
  by a real tenant-scoped `GET /api/purchase-tasks` (empty, loading and error
  states, plus a fixture-tested task card), a placeholder `/tasks/[taskId]` that
  404s for missing and other-tenant ids, and a split-layout sign-in. The P0-3
  identity check moved to [`/dev/whoami`](http://localhost:3000/dev/whoami).
  `pnpm check`, `pnpm build` and the browser walk-through in the roadmap's
  P0-6 acceptance criteria all pass (2026-09-24).

- **P0-7 complete:** CI `integration` job. Starts the docker-compose Postgres
  (same `timescaledb-ha:pg17` image as dev, ~30 s pull), migrates an empty
  database, asserts the app role is neither superuser nor BYPASSRLS, then runs
  `pnpm test:integration`. Green on `main`, proven to fail on a deliberately
  broken suite, and a required check on `main` alongside `verify`.

- **P0-8 complete:** secret scanning with gitleaks
  8.30.1 and `.gitleaks.toml` (upstream rules plus a Clerk publishable-key
  rule). It runs as a lefthook `pre-commit` hook on staged changes and as the
  CI `secrets` job on the PR's commits (the full history on `main`), with
  redacted output. The full history scans clean, a `--no-verify` push of a
  planted key fails `secrets` in CI, and `secrets` is a required check on `main`.

- **P0-9 complete:** git hooks. `pre-commit` formats staged files with oxfmt
  (re-staged), then lints them with oxlint and runs the Tailwind check and
  gitleaks; `pre-push` runs `pnpm typecheck`. oxfmt is pinned to 0.68.0. All
  acceptance checks pass on macOS, including partially staged files.

Phase 1 — HtAG Integration + Suburb Screener:

- **P1-0 complete:** schema delta for the HtAG data
  shape. `suburb_metrics_ts` is rekeyed per D40 —
  `(suburb_id, property_type, bedrooms, metric_name, measured_at)`, with
  `observed_at` renamed to `measured_at` (HtAG `period_end`) and `confidence`
  added. `suburbs.htag_id` is renamed to `htag_area_id` (HtAG `loc_pid`), and
  `abs_sal_code` is added. The new `htag_calls` spend ledger is tenant-scoped
  with RLS. Migrations 0010–0012 wrap the generated one in a compression
  off/on pair (D60). Migrated cleanly on the existing dev DB;
  `pnpm test:integration` and `pnpm check` pass (2026-09-24).

- **P1-1 complete:** `@my-ba/htag-client` —
  `queryMarkets` (one page + `truncated`, D42/D64), `summary` and six `trends`
  series (auto-paginated), typed errors, retries on 5xx/network only, row
  normalisation (DOM `0`, vacancy `-1`, `period_end`, `confidence`). Contract
  tests run on fixtures captured from the live API (`scripts/htag/capture-fixtures.sh`);
  `docs/htag/openapi.json` is the vendored spec (D61). Spend goes to `htag_calls`
  through `createHtagCallRecorder` in `@my-ba/db` (D63) with HtAG's
  `X-Billing-*` headers as the cost of record (D62); migration `0013` adds the
  billing columns. gitleaks gains an `htag-api-key` rule. `pnpm db:migrate`,
  `pnpm check`, `pnpm test:integration` and `pnpm secrets:scan` pass (2026-10-01).

- **P1-8 complete:** `@my-ba/domain`, a new pure package. `presetWeights` for
  the 9 strategy × risk presets and `presetFilterDefaults` (D17, D19, D68),
  `PRESET_VERSION`, a strict normalised `Weights` schema, and `rankSuburbs`:
  yield, rent growth and volatility ranked within the survivor set; a 36-month
  growth ceiling and a 15–35% renter band on absolute curves; `insufficientData`
  below 50% coverage; `areaId` tie-break (D44, D67, D68). Q02 resolved: criteria
  are fixed fields (D66). `pnpm check` passes (2026-10-01).

- **P1-3 complete:** criteria schema and form. Fixed criteria (D66) in
  `@my-ba/shared` with a partial draft variant; `POST` / `PATCH
/api/purchase-tasks` saving drafts (DRAFT-only edits, run-intent validation)
  and a screening cost-ceiling endpoint; `compileToHtagLogic` in
  `@my-ba/htag-client`; a three-step `/tasks/new` and `/tasks/[taskId]/edit`
  form with preset prefill and customised flags (D69). Also landed: a
  design-system-aware `cn` (D70), view transitions (D71), a breadcrumb factory,
  form steps on shadcn tabs. HtAG probes confirmed `irsad` is a decile and
  `price_3y_cagr` works in `logic` (Q16). `pnpm check`, `pnpm build`,
  `pnpm test:integration`, `pnpm secrets:scan` and CI pass (2026-10-07).

- **P1-10 complete:** ABS 2021 Census tenure. `pnpm abs:load` reads the
  SAL DataPack from gitignored `data/abs/` (pinned by SHA-256) into
  `abs_sal_tenure`: 15,345 suburbs, raw counts plus a renter proportion
  (rented ÷ stated tenure, null under 20 dwellings or when ABS perturbation
  pushes it outside 0–1). `suburbs` gain `abs_sal_match`; the resolver
  matches by name within the state and asks HtAG's `sal-to-locality`
  concordance only for ambiguous names, recording `unmatched` so nothing is
  paid twice (D72). Migrations `0014`–`0015`, an RLS-coverage integration
  test, and opt-in pgAdmin (`pnpm db:admin`). AC 1 (≥ 95% coverage) is
  measured on P1-4's first real screen. `pnpm check` and
  `pnpm test:integration` pass (2026-10-08).

Next up: **P1-4** (screener, D73).
