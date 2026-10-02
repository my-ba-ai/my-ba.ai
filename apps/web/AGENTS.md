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

| Need                                                                                  | Path under `node_modules/next/dist/docs/01-app/`         |
| ------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Orientation, core concepts                                                            | `01-getting-started/index.md`                            |
| Layouts, pages, routing                                                               | `01-getting-started/03-layouts-and-pages.md`             |
| Server vs Client Components                                                           | `01-getting-started/05-server-and-client-components.md`  |
| Data fetching                                                                         | `01-getting-started/06-fetching-data.md`                 |
| Mutations, Server Actions                                                             | `01-getting-started/07-mutating-data.md`                 |
| Caching and revalidation                                                              | `01-getting-started/08-caching.md`, `09-revalidating.md` |
| Error handling                                                                        | `01-getting-started/10-error-handling.md`                |
| Metadata and OG images                                                                | `01-getting-started/14-metadata-and-og-images.md`        |
| Route handlers                                                                        | `01-getting-started/15-route-handlers.md`                |
| File conventions (`page`, `layout`, `route`, `middleware`, `loading`, `error`)        | `03-api-reference/03-file-conventions/`                  |
| Functions (`cookies`, `headers`, `redirect`, `revalidateTag`, `generate-metadata`, …) | `03-api-reference/04-functions/`                         |
| Directives (`use client`, `use server`, `use cache`)                                  | `03-api-reference/01-directives/`                        |
| `next.config.ts` options                                                              | `03-api-reference/05-config/01-next-config-js/`          |
| Turbopack                                                                             | `03-api-reference/08-turbopack.md`                       |
| Guides — 65 of them, incl. testing, forms, auth, self-hosting                         | `02-guides/`                                             |

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
- `src/components/ui/` is vendored shadcn source on Base UI (`components.json`, style
  `base-vega`). Add or update it with `pnpm dlx shadcn@latest add <name>`, never by hand,
  and never edit it to reach a design token: remap in the `@theme inline` block of
  `globals.css` instead (D54).
- `cn` must know the design-system scales (D70). The bare `cn` import resolves to
  `src/lib/utils.ts` (tsconfig `paths` + Vitest `alias`), a `createCn` instance
  configured with our custom `--text-*`, `--shadow-*`, `--font-*` and `--animate-*`
  keys. Without it, `text-body-sm` is read as a colour and dropped next to
  `text-ink-muted`. Adding a token to `@theme` means adding it to
  `DESIGN_SYSTEM_THEME`; `utils.test.ts` fails until you do. The folder is excluded from oxlint for the same reason:
  lint findings there would need edits that the next regenerate reverts. Design-system components (gradient CTA, status pill, stat
  tile) are our own wrappers composed over these primitives. Base UI composes with
  `render={<Button />}`, not Radix's `asChild`. Forms use `field`, not `form`.
- TanStack Table is **v9** (`useTable`, `tableFeatures`, `createColumnHelper<features, row>`,
  `table.FlexRender`). Most examples online and in training data are v8 (`useReactTable`,
  `getCoreRowModel`) and won't compile here. The package ships its own agent docs: read
  `node_modules/@tanstack/react-table/skills/*/SKILL.md` before writing a table.
- React is **19.3** with no React Compiler enabled. For component, form, data-fetching and
  Effect patterns, read `.claude/skills/modern-react-guidance/SKILL.md` (vendored third-party
  skill, pinned; see its `SOURCE.md`). Its Compiler rules don't apply until the Compiler is on,
  and verify any 19.3-only API it names against react.dev before using it.
- **Component props are an `interface Props`, never an inline type.** Follow
  `src/components/tasks/stage-stepper.tsx`:

  ```tsx
  interface Props {
    status: TaskStatus
    variant?: "compact" | "full"
  }
  /** What the component is for, and anything non-obvious about it. */
  export function StageStepper({ status, variant = "compact" }: Readonly<Props>) {
  ```

  - Declare it with `interface`, named exactly `Props`, directly above the
    component, and destructure it as `Readonly<Props>`. Not
    `({ status }: { status: TaskStatus })`, not `Readonly<{ … }>` inline, not `type Props = { … }`.
  - Keep it unexported. If another module needs the shape, export it under the
    component's name (`export interface StageStepperProps`) and use that name in
    the file too.
  - A file with more than one component (a private helper beside the exported one)
    names each interface after its component: `RowProps`, `FilterRowProps`. The
    file's main component keeps `Props`.
  - Extending element or primitive props: `interface Props extends
React.ComponentProps<"button"> { … }` or `extends SliderPrimitive.Root.Props`.
  - `type` only where an interface can't express it: a discriminated union of
    prop shapes, or a generic constrained in ways `interface` can't model. Still
    name it `Props`.
  - No props, no interface. Document a prop with a `/** … */` on its field when
    its meaning isn't obvious from name and type.
  - Doesn't apply to `src/components/ui/` (vendored, D54) or to Next's own page
    and layout props (`PageProps<"/route">`, `LayoutProps<…>`), which come from
    typegen.

- Type is Manrope only (D55). Numbers, codes, IDs and uppercase micro-labels use
  `font-data` (tabular figures). `font-mono` is for raw machine output only (JSON, error
  lines, logs). Never put a metric in `font-mono`.
- **Tailwind classes: design token first, then canonical scale, then arbitrary value.**
  Pick the first of these that produces the value you want:
  1. A design-system token utility from `globals.css`. Type is the named scale
     (`text-headline`, `text-section`, `text-body`, `text-body-sm`, `text-value`,
     `text-value-lg`, `text-micro`, `text-micro-lg`, `text-metric`), not
     `text-[23px] font-semibold`. A type token already sets its line-height, weight
     and tracking, so don't restate them. Colours are token names (`bg-border-soft`),
     never the hex behind them (`bg-[#edf1f6]`).
  2. Tailwind's canonical spelling on the default scale: `gap-0.75` not `gap-[3px]`,
     `px-4.5` not `px-[18px]`, `max-w-100` not `max-w-[400px]`, `duration-170` not
     `duration-[170ms]`, `bg-(image:--accent-grad)` not `bg-[image:var(--accent-grad)]`.
     v4 spacing is `--spacing` (4px) times any multiple of 0.25, so nearly every px
     value on the design system's 4px grid has one.
  3. An arbitrary value, only when neither exists (`tracking-[0.09em]`,
     `grid-cols-[88px_1fr]`, a colour with no token).

  `pnpm lint` enforces 1 and 2 through `scripts/check-tailwind-canonical.mjs`, which
  resolves against this app's compiled theme. Radius and text sizes are remapped in
  `@theme inline` (D54), so `rounded-md` is 10px here, not Tailwind's 6px. Don't
  reason from Tailwind's default docs. `pnpm --filter @my-ba/web lint:tailwind --fix`
  rewrites the canonical-spelling cases. Token cases are reported only, because a
  token replaces several classes at once and has to be applied by hand.
  `src/components/ui/` is excluded (vendored, D54).

- **Breadcrumbs come from the factory, never hand-built.** Pass a trail to
  `PageHeader`: `<PageHeader title={…} breadcrumbs={breadcrumbs.taskEdit(task)} />`.
  `src/lib/breadcrumbs.ts` holds one builder per route, each extending its parent's
  trail; the last crumb is the current page (unlinked, `aria-current`). A new page
  gets a builder there, not inline JSX. Rendering is `PageBreadcrumb` over the
  vendored shadcn `breadcrumb` component. Top-level pages (the task list) have none.
- **View transitions (D71)** use React `<ViewTransition>` (from `react`) and Next's
  `<Link transitionTypes>`. Read `node_modules/next/dist/docs/01-app/02-guides/view-transitions.md`
  first. Conventions:
  - **Pages:** every `page.tsx` wraps its returned content in `PageTransition`, not
    a layout, because layouts persist and never enter or exit.
  - **Link direction:** links going deeper take `transitionTypes={NAV_FORWARD}`,
    links towards the root take `NAV_BACK` (breadcrumbs do this already). Names and
    types live in `src/lib/view-transitions.ts`.
  - **Named pairs:** a shared-element pair uses the same `name` with
    `share="morph" default="none"`. Without `default="none"` it animates on every
    transition.
  - **State changes:** a state change only animates inside `startTransition`;
    a plain `setState` swaps instantly.
  - **Motion limits:** stay within design-system §5. Durations are ≤ 220ms, and
    `prefers-reduced-motion` is already handled in `globals.css`.
- Light mode only. Don't add `dark:` classes or a theme provider.
- `/dev/ui` is the component gallery and the D52 spike. It 404s in production.
- Tests are Vitest + Testing Library, jsdom environment, named `*.test.tsx`
  alongside the component. Nest's `*.spec.ts` convention is deliberately different.
