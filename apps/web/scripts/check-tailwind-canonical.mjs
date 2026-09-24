#!/usr/bin/env node
/**
 * Fails when a class in apps/web/src has a canonical Tailwind spelling that
 * differs from the one written: `gap-[3px]` → `gap-0.75`,
 * `max-w-[400px]` → `max-w-100`, `rounded-[10px]` → `rounded-md`.
 *
 * Canonical is resolved against *this app's* theme (globals.css, including the
 * `@theme inline` remaps from D54), not Tailwind's defaults. That is why this
 * uses Tailwind's own `canonicalizeCandidates` rather than a lookup table:
 * `rounded-md` is 10px here, not 6px, and only the compiled design system knows
 * that.
 *
 * Arbitrary values with no canonical equivalent (`text-[13.5px]`,
 * `tracking-[0.09em]`) pass. The rule is "use the scale when the scale has
 * it", not "never use brackets".
 *
 * Second pass, report-only: an arbitrary value that equals a design token
 * (`bg-[#edf1f6]` → `bg-border-soft`, `text-[23px]` → `text-section`).
 * Tailwind cannot see these because the tokens go through `var()`, so the CSS
 * is not byte-identical. They are not auto-fixed: a `text-*` token also sets
 * line-height, weight or tracking, so the neighbouring classes need a human
 * look.
 *
 * Pure JS on purpose (tailwindcss's lib, no oxide/lightningcss), so it runs
 * wherever node does. `__unstable__loadDesignSystem` is Tailwind's API for
 * editor tooling; if an upgrade renames it, this script fails loudly rather
 * than passing silently.
 *
 * Usage: node scripts/check-tailwind-canonical.mjs [--fix]
 */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const require = createRequire(import.meta.url)
const { __unstable__loadDesignSystem: loadDesignSystem } = require("tailwindcss")

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const srcRoot = join(appRoot, "src")
const cssPath = join(srcRoot, "app", "globals.css")
const fix = process.argv.includes("--fix")

// Vendored shadcn source is regenerated, never hand-edited (D54) — same
// exclusion as oxlint.
const EXCLUDED_DIRS = new Set([join(srcRoot, "components", "ui")])

if (typeof loadDesignSystem !== "function") {
  console.error("tailwindcss no longer exports __unstable__loadDesignSystem — update this script.")
  process.exit(2)
}

/**
 * Node-style lookup up the node_modules chain. Not `require.resolve`, because
 * CSS-only packages (tw-animate-css) do not export `./package.json`.
 */
function findPackageJson(pkgName, from) {
  for (let dir = from; ; dir = dirname(dir)) {
    const candidate = join(dir, "node_modules", pkgName, "package.json")
    if (existsSync(candidate)) return candidate
    if (dirname(dir) === dir) throw new Error(`Cannot find package ${pkgName} from ${from}`)
  }
}

/** Resolves `@import "pkg"` / `@import "pkg/sub.css"` the way the CSS pipeline does: the `style` condition. */
function resolveStylesheet(id, base) {
  if (id.startsWith(".") || id.startsWith("/")) return resolve(base, id)

  const parts = id.split("/")
  const pkgName = id.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0]
  const subpath = "." + id.slice(pkgName.length)
  const pkgJsonPath = findPackageJson(pkgName, base)
  const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf8"))
  const entry = pkg.exports?.[subpath === "." ? "." : subpath]
  const target =
    (typeof entry === "string" ? entry : (entry?.style ?? entry?.default)) ??
    (subpath === "." ? pkg.style : subpath)
  if (!target) throw new Error(`Cannot resolve stylesheet ${id} from ${base}`)
  return join(dirname(pkgJsonPath), target)
}

const designSystem = await loadDesignSystem(readFileSync(cssPath, "utf8"), {
  base: dirname(cssPath),
  loadStylesheet: async (id, base) => {
    const path = resolveStylesheet(id, base)
    return { path, base: dirname(path), content: readFileSync(path, "utf8") }
  },
  loadModule: async () => {
    throw new Error(
      "globals.css loads no JS plugins or configs; if that changes, teach this script",
    )
  },
})

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (EXCLUDED_DIRS.has(path)) continue
    if (statSync(path).isDirectory()) walk(path, out)
    else if (/\.(tsx?|jsx?)$/.test(name) && !/\.test\.[jt]sx?$/.test(name)) out.push(path)
  }
  return out
}

// String literals and static template-literal chunks. Class names only ever
// live in these, and scanning every literal (not just `className=`) catches
// cn(), cva() and constants like `const shimmer = "..."`.
const LITERAL = /"([^"\\\n]*)"|'([^'\\\n]*)'|`([^`]*)`/g

/**
 * Token values from globals.css: colour utilities (`--color-x: var(--tok)` in
 * `@theme inline`, resolved through `:root --tok: #hex`) and the `--text-*`
 * type scale (rem → px).
 */
function buildTokenIndex(css) {
  const rootVars = new Map(
    [...css.matchAll(/^\s*--([\w-]+):\s*(#[0-9a-fA-F]{3,8})\s*;/gm)].map((m) => [
      m[1],
      m[2].toLowerCase(),
    ]),
  )
  const colours = new Map()
  for (const m of css.matchAll(/^\s*--color-([\w-]+):\s*var\(--([\w-]+)\)\s*;/gm)) {
    const hex = rootVars.get(m[2])
    if (hex && !colours.has(hex)) colours.set(hex, m[1])
  }
  const sizes = new Map()
  for (const m of css.matchAll(/^\s*--text-([\w-]+):\s*([\d.]+)rem\s*;/gm)) {
    // Several roles can share a size (card-title and body are both 14px);
    // keep them all and let the author pick the role.
    const px = String(Number(m[2]) * 16)
    sizes.set(px, [...(sizes.get(px) ?? []), m[1]])
  }
  return { colours, sizes }
}

const tokens = buildTokenIndex(readFileSync(cssPath, "utf8"))

/** `bg-[#EDF1F6]` → `bg-border-soft`; `text-[23px]` → `text-section`. Variants are kept. */
function tokenFor(candidate) {
  const m = candidate.match(/^((?:[\w-]+:)*)([a-z-]+?)-\[([^\]]+)\](\/\d+)?$/)
  if (!m) return null
  const [, variants, utility, value, opacity = ""] = m
  const hex = value.toLowerCase()
  if (/^#[0-9a-f]{3,8}$/.test(hex) && tokens.colours.has(hex)) {
    return {
      canonical: `${variants}${utility}-${tokens.colours.get(hex)}${opacity}`,
      kind: "colour",
    }
  }
  const px = value.match(/^([\d.]+)px$/)
  if (utility === "text" && px && tokens.sizes.has(px[1])) {
    const options = tokens.sizes.get(px[1]).map((name) => `${variants}text-${name}`)
    return { canonical: options.join(" or "), kind: "type" }
  }
  return null
}

const isUtility = (candidate) => designSystem.candidatesToCss([candidate])[0] != null

const findings = []
const tokenFindings = []
for (const file of walk(srcRoot)) {
  let source = readFileSync(file, "utf8")
  const replacements = new Map()

  for (const match of source.matchAll(LITERAL)) {
    const text = (match[1] ?? match[2] ?? match[3]).replace(/\$\{[^}]*\}/g, " ")
    for (const candidate of text.split(/\s+/)) {
      if (!candidate || !isUtility(candidate)) continue
      const token = tokenFor(candidate)
      if (token) {
        const line = source.slice(0, match.index).split("\n").length
        tokenFindings.push({ file: relative(appRoot, file), line, candidate, ...token })
        continue
      }
      const [canonical] = designSystem.canonicalizeCandidates([candidate], { rem: 16 })
      if (canonical && canonical !== candidate) {
        const line = source.slice(0, match.index).split("\n").length
        findings.push({ file: relative(appRoot, file), line, candidate, canonical })
        replacements.set(candidate, canonical)
      }
    }
  }

  if (fix && replacements.size > 0) {
    for (const [from, to] of replacements) {
      // Whole-class match only: bounded by quote, backtick, or whitespace.
      const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      source = source.replace(new RegExp(`(?<=[\\s"'\`])${escaped}(?=[\\s"'\`])`, "g"), to)
    }
    writeFileSync(file, source)
  }
}

for (const f of findings) {
  console.log(`${f.file}:${f.line}  ${f.candidate}  →  ${f.canonical}`)
}
for (const f of tokenFindings) {
  const note =
    f.kind === "type"
      ? "type token: also sets line-height/weight/tracking, drop the classes it replaces"
      : "colour token"
  console.log(`${f.file}:${f.line}  ${f.candidate}  →  ${f.canonical}  (${note})`)
}

const remaining = (fix ? 0 : findings.length) + tokenFindings.length
if (findings.length + tokenFindings.length === 0) {
  console.log("tailwind: every class is canonical and no arbitrary value duplicates a design token")
} else {
  console.log(
    `\n${findings.length} non-canonical class(es)` +
      (fix ? " rewritten in place" : " (fixable with --fix)") +
      `, ${tokenFindings.length} arbitrary value(s) duplicating a design token (fix by hand).`,
  )
}
process.exit(remaining > 0 ? 1 : 0)
