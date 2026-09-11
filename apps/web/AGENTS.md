# apps/web — agent guide

Next.js 16 App Router. Repo-wide rules are in the root [`AGENTS.md`](../../AGENTS.md)
and still apply here.

## Read the bundled Next.js docs before answering from memory

Next 16 ships its full documentation as markdown inside the installed package.
**Read it.** It is version-exact for what this repo actually has installed, which
training data is not — Next 16 changed enough that recalled patterns are often
wrong here.

```
apps/web/node_modules/next/dist/docs/
```

Note the path: pnpm uses an isolated store, so `next` is **not** hoisted to the
repo root. There is no `node_modules/next` at the top level. The path above only
exists after `pnpm install`.

### Map — use `01-app/` only

This project is App Router. **Ignore `02-pages/` entirely**; those patterns do not
apply and following them will produce code that does not belong in this codebase.

| Need | Path under `node_modules/next/dist/docs/01-app/` |
|---|---|
| Orientation, core concepts | `01-getting-started/index.md` |
| Layouts, pages, routing | `01-getting-started/03-layouts-and-pages.md` |
| Server vs Client Components | `01-getting-started/05-server-and-client-components.md` |
| Data fetching | `01-getting-started/06-fetching-data.md` |
| Mutations, Server Actions | `01-getting-started/07-mutating-data.md` |
| Caching and revalidation | `01-getting-started/08-caching.md`, `09-revalidating.md` |
| Error handling | `01-getting-started/10-error-handling.md` |
| Metadata and OG images | `01-getting-started/14-metadata-and-og-images.md` |
| Route handlers | `01-getting-started/15-route-handlers.md` |
| File conventions (`page`, `layout`, `route`, `middleware`, `loading`, `error`) | `03-api-reference/03-file-conventions/` |
| Functions (`cookies`, `headers`, `redirect`, `revalidateTag`, `generate-metadata`, …) | `03-api-reference/04-functions/` |
| Directives (`use client`, `use server`, `use cache`) | `03-api-reference/01-directives/` |
| `next.config.ts` options | `03-api-reference/05-config/01-next-config-js/` |
| Turbopack | `03-api-reference/08-turbopack.md` |
| Guides — 65 of them, incl. testing, forms, auth, self-hosting | `02-guides/` |

Two Next 16 areas worth checking the docs on specifically rather than assuming:
**cache components** (`02-guides/migrating-to-cache-components.md`, and the
`use-cache` / `cacheLife` / `cacheTag` references) and **Turbopack as the default
builder** for both `dev` and `build`.

## This app's conventions

- Source lives under `src/` — `src/app/` for routes, `src/components/` for shared UI.
  The `@/*` alias maps to `src/*`.
- Tailwind v4, configured through `@tailwindcss/postcss`. Theme tokens go in the
  `@theme` block in `src/app/globals.css`, not in a `tailwind.config.js` — v4 has no
  JS config file here.
- Server Components by default. Add `'use client'` only when you actually need
  state, effects, or browser APIs, and push it as far down the tree as possible.
- Types and schemas shared with the API come from `@my-ba/shared`. Do not redeclare
  a shape here that already exists there — if the API returns it, the schema is the
  contract.
- `typedRoutes` is on. Route strings are typechecked; a broken link is a build error.
- Visual direction is in `docs/07-design-brief.md` and `docs/design-system.md`, with a
  reference prototype at `docs/prototypes/`. Match those rather than inventing styling.
- Tests are Vitest + Testing Library, jsdom environment, named `*.test.tsx`
  alongside the component. Nest's `*.spec.ts` convention is deliberately different.
