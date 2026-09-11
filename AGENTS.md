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
| `packages/shared` | Zod schemas, domain types, queue names. The contract all three apps compile against. |
| `packages/config` | Shared tsconfig presets: `base` / `lib` / `nest` / `next`. |

## Rules that are not negotiable

- **Never import across workspace boundaries by relative path.** `packages/shared`
  compiles to `dist` and apps depend on its `build`. Import `@my-ba/shared`, never
  `../../packages/shared/src`. Turbo orders the graph; a relative import silently
  breaks it.
- **`tenant_id` on every table, from day one** (D26). There is one user today and
  this is still not optional. Retrofitting it is the expensive version.
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
```

Lint is Oxlint, format is oxfmt, tests are Vitest everywhere. There is no ESLint
and no Prettier in this repo; do not add them. Type-level checking is `tsc --noEmit`
via `pnpm typecheck`, deliberately not the linter's job (D34).

The Nest apps compile to CommonJS with decorator metadata. Vitest transforms them
through SWC because esbuild does not emit that metadata — if you add a Nest app,
copy `apps/api/vitest.config.ts` rather than writing a fresh one.

## Where things are going

Phase order and ticket acceptance criteria are in `docs/05-roadmap-and-phases.md`.
P0-1 (this scaffold) is done. P0-5 — the LangGraph.js durable-interrupt spike — is
the gate ticket: if it fails, the orchestrator design changes and Phase 1 waits.
Keep the orchestrator behind the narrow `runStage(taskId, stage) -> StageResult`
interface so it stays swappable.
