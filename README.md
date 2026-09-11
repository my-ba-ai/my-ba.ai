# my-ba.ai

Automates the suburb-selection and agent-outreach workflow for Australian
investment property purchases. Product and architecture docs live in [`docs/`](./docs);
[`docs/04-decisions-log.md`](./docs/04-decisions-log.md) is the living document.

## Layout

```
apps/
  api/        NestJS 11 — REST + BFF. Owns HTTP, auth, tenant routing.
  web/        Next.js 16 App Router + Tailwind v4.
  worker/     NestJS standalone context — BullMQ processors (P0-4). Scales separately.
packages/
  shared/     Zod schemas, domain types, queue names. The contract between all three apps.
  config/     Shared tsconfig presets (base / lib / nest / next).
```

`packages/shared` compiles to `dist` and every app depends on its `build`, so
`turbo` orders the graph for you — never import from `../../packages/shared/src`.

## Prerequisites

- Node 22.12+ (`.nvmrc` pins the version used here)
- pnpm 10+ — `corepack enable && corepack prepare pnpm@10.28.0 --activate`

## Getting started

```bash
pnpm install
pnpm build          # shared must build before the apps typecheck
pnpm dev            # api :3001, web :3000, worker (no HTTP)
```

Copy `.env.example` to `.env` in each app before running `dev`.

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

## Conventions

- TypeScript strict, plus `noUncheckedIndexedAccess` and no unused locals/params.
- Zod at every boundary, including outbound responses.
- Filenames kebab-case (enforced by Oxlint).
- Nest apps compile to CommonJS with decorator metadata; Vitest transforms them
  through SWC because esbuild does not emit that metadata.

## Status

P0-1 complete: scaffold, three apps booting, shared contract, CI. Next up P0-2
(Postgres + TimescaleDB + pgvector, Drizzle schema) and P0-5 (LangGraph.js HITL
spike — the gate ticket for Phase 1).
