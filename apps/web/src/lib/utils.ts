import { createCn } from "cn/config"

/**
 * Design-system theme keys that `cn` must know about (D70).
 *
 * `cn` (like tailwind-merge) only knows Tailwind's default scales. Without
 * this, `text-body-sm` looks like a text *colour*, so `cn("text-body-sm
 * text-ink-muted")` silently drops the size, and `shadow-panel` never replaces
 * a component's `shadow-xs`. Every custom `--text-*`, `--shadow-*`, `--font-*`
 * and `--animate-*` in the `@theme` block of `src/app/globals.css` must be
 * listed here; `utils.test.ts` fails when the two drift.
 */
export const DESIGN_SYSTEM_THEME = {
  text: [
    "headline",
    "section",
    "card-title",
    "body",
    "body-lg",
    "body-sm",
    "value",
    "value-lg",
    "metric-sm",
    "metric",
    "micro",
    "micro-lg",
  ],
  shadow: ["panel", "hover", "cta"],
  font: ["data", "heading"],
  animate: ["pulse-live", "shim", "drift", "slidein"],
} as const satisfies Record<string, readonly string[]>

/**
 * Class joining + conflict resolution that understands the design-system
 * scales. This module is also what the bare `cn` import resolves to inside
 * `apps/web` (tsconfig `paths`, Vitest `alias`), so the vendored shadcn
 * components in `src/components/ui/` — which import `{ cn } from "cn"` and are
 * never hand-edited — get the same behaviour. It imports the real package via
 * `cn/config`, which the exact-match alias does not catch.
 */
export const cn = createCn({
  extend: {
    theme: {
      text: [...DESIGN_SYSTEM_THEME.text],
      shadow: [...DESIGN_SYSTEM_THEME.shadow],
      font: [...DESIGN_SYSTEM_THEME.font],
      animate: [...DESIGN_SYSTEM_THEME.animate],
    },
  },
})
