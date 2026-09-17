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
  config/     Shared tsconfig presets (base / lib / nest / next).
infra/
  postgres/   Container init — creates the non-superuser application role.
```

`packages/shared` compiles to `dist` and every app depends on its `build`, so
`turbo` orders the graph for you — never import from `../../packages/shared/src`.

## Prerequisites

- Node 22.12+ (`.nvmrc` pins the version used here)
- pnpm 10+ — `corepack enable && corepack prepare pnpm@10.28.0 --activate`
- Docker, for local Postgres

## Getting started

```bash
pnpm install
pnpm build          # shared must build before the apps typecheck

cp packages/db/.env.example packages/db/.env
cp apps/api/.env.example apps/api/.env

pnpm db:up          # Postgres 17 + TimescaleDB + pgvector on :5432
pnpm db:bootstrap   # one-time: writes the initial migration set
pnpm db:migrate     # apply them

pnpm dev            # api :3001, web :3000, worker (no HTTP)
```

Check it landed:

```bash
curl -s localhost:3001/api/health/db
# {"status":"ok","extensions":{"timescaledb":"…","vector":"…"},"rlsEnforced":true,…}
```

`rlsEnforced: false` means the API is connected as a superuser and every
tenant policy in the schema is doing nothing (D40).

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | All three apps in watch mode |
| `pnpm build` | Turbo build, respecting the dependency graph |
| `pnpm typecheck` | `tsc --noEmit` across every workspace |
| `pnpm lint` | Oxlint |
| `pnpm format` | oxfmt (write); `pnpm format:check` in CI |
| `pnpm test` | Vitest across every workspace |
| `pnpm check` | typecheck + lint + format:check + test — what CI runs |
| `pnpm db:up` / `db:down` | Local Postgres via docker compose |
| `pnpm db:generate` | Schema change → migration. Never hand-write `CREATE TABLE` |
| `pnpm db:migrate` | Apply migrations. Explicit step, never on startup (D39) |
| `pnpm db:studio` | Drizzle Studio against the local database |

## Conventions

- TypeScript strict, plus `noUncheckedIndexedAccess` and no unused locals/params.
- Zod at every boundary, including outbound responses.
- Filenames kebab-case (enforced by Oxlint).
- Nest apps compile to CommonJS with decorator metadata; Vitest transforms them
  through SWC because esbuild does not emit that metadata.

## Status

P0-1 complete: scaffold, three apps booting, shared contract, CI.

P0-2 complete: Postgres + TimescaleDB + pgvector, Drizzle schema for tenants /
users / purchase tasks / suburbs, a `suburb_metrics_ts` hypertable with a
compression policy, RLS enforced against a non-superuser application role.

Next up P0-3 (Clerk auth, tenant resolution from the JWT — the schema is
already shaped for it) and P0-5 (LangGraph.js HITL spike — the gate ticket for
Phase 1).
