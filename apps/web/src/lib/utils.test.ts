// @vitest-environment node
// Node, not jsdom: the drift check reads globals.css through `import.meta.url`,
// which jsdom rewrites to an http:// URL that `readFileSync` rejects.
import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { DESIGN_SYSTEM_THEME, cn } from "./utils"

/** Custom keys declared in the `@theme inline` block of globals.css, by namespace. */
function themeKeys(namespace: string): string[] {
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8")
  const theme = css.slice(css.indexOf("@theme inline"))
  const re = new RegExp(`--${namespace}-([a-z0-9-]+?)(--[a-z-]+)?:`, "g")
  const keys = new Set<string>()
  for (const match of theme.matchAll(re)) {
    // `--text-body--line-height` is a modifier of `body`, not a key of its own.
    if (match[1] && !match[2]) keys.add(match[1])
  }
  return [...keys].toSorted()
}

describe("cn knows the design-system scales (D70)", () => {
  it.each([
    ["text", DESIGN_SYSTEM_THEME.text],
    ["shadow", DESIGN_SYSTEM_THEME.shadow],
    ["animate", DESIGN_SYSTEM_THEME.animate],
  ] as const)("every custom --%s-* in globals.css is registered", (namespace, registered) => {
    expect([...registered].toSorted()).toEqual(themeKeys(namespace))
  })

  it("keeps a design-system font size next to a text colour", () => {
    expect(cn("text-body-sm text-ink-muted")).toBe("text-body-sm text-ink-muted")
    expect(cn("font-data text-micro-lg text-ink-dim uppercase")).toBe(
      "font-data text-micro-lg text-ink-dim uppercase",
    )
  })

  it("lets a design-system size or colour override a vendored default", () => {
    expect(cn("text-sm text-muted-foreground", "text-value text-ink-3")).toBe(
      "text-value text-ink-3",
    )
    expect(cn("text-xs font-medium", "text-micro-lg")).toBe("font-medium text-micro-lg")
  })

  it("resolves design-system shadows and fonts against Tailwind's", () => {
    expect(cn("shadow-xs", "shadow-panel")).toBe("shadow-panel")
    expect(cn("font-sans", "font-data")).toBe("font-data")
    expect(cn("font-data font-semibold")).toBe("font-data font-semibold")
  })

  it("is what the bare `cn` import resolves to (vendored components)", async () => {
    const vendored = await import("cn")
    expect(vendored.cn).toBe(cn)
  })
})
