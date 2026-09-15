# my-ba.ai — agent guide

SaaS that automates suburb selection and agent outreach for Australian
investment property purchases. Product and architecture docs are in [`docs/`](./docs);
[`docs/04-decisions-log.md`](./docs/04-decisions-log.md) is the living document and
the first thing to read before proposing anything architectural.

## Repo shape

| Path | What it is |
|---|---|
| `apps/api` | NestJS 11 — REST + BFF. HTTP, auth, tenant routing. |
| `apps/web` | Next.js 16 App Router + Tailwind v4. Has its own `AGENTS.md`. |
| `apps/worker` | NestJS standalone context — BullMQ processors. Scales independently of the API. |
| `packages/db` | Drizzle schema, migrations, pool factory, tenant-scoped transaction wrapper. |
| `packages/shared` | Zod schemas, domain types, queue names. The contract all three apps compile against. |
| `packages/config` | Shared tsconfig presets: `base` / `lib` / `nest` / `next`. |

## Rules that are not negotiable

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
- **Every query runs inside `withTenant()`** (`packages/db/src/tenant.ts`), which
  sets `app.tenant_id` transaction-locally. Outside it the app role sees an empty
  database. That is the design: a query that forgets its tenant returns nothing
  rather than everything. One exception: `suburb_metrics_ts` has no RLS, because
  TimescaleDB does not support it on compressed chunks (D43). A CHECK constraint
  pins that table to the system tenant instead — do not drop it.
- **Zod at every boundary, inbound and outbound.** Parse, don't cast. The health
  endpoint parses its own response on the way out — follow that pattern.
- **TypeScript strict**, plus `noUncheckedIndexedAccess`, `noUnusedLocals`,
  `noUnusedParameters`. Do not loosen a tsconfig to make an error go away.
- **Filenames kebab-case**, enforced by Oxlint.
- **Don't relitigate a LOCKED decision** in `docs/04-decisions-log.md` without
  saying explicitly that you are doing so, and why.

## Commands

```bash
pnpm install
pnpm build        # shared builds first; run once before typecheck on a clean clone
pnpm dev          # api :3001, web :3000, worker (no HTTP)
pnpm check        # typecheck + lint + format:check + test — what CI runs

pnpm db:up        # Postgres + TimescaleDB + pgvector in docker
pnpm db:generate  # schema change -> new migration (never hand-write CREATE TABLE)
pnpm db:migrate   # apply migrations. Explicit, never on app startup (D39)
```

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

## Where things are going

Phase order and ticket acceptance criteria are in `docs/05-roadmap-and-phases.md`.
P0-1 (scaffold) and P0-2 (database) are done. P0-5 — the LangGraph.js durable-interrupt spike — is
the gate ticket: if it fails, the orchestrator design changes and Phase 1 waits.
Keep the orchestrator behind the narrow `runStage(taskId, stage) -> StageResult`
interface so it stays swappable.
