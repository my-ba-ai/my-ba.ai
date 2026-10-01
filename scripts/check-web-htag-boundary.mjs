#!/usr/bin/env node
// P1-1 AC 11: the HtAG key is server-side only (HtAG T&C cl. 36). apps/web must
// never reference HTAG_API_KEY or depend on @my-ba/htag-client, directly or via
// its package.json. Runs as part of `pnpm lint`.
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"

const ROOT = new URL("..", import.meta.url).pathname
const WEB = join(ROOT, "apps/web")
const SKIP = new Set(["node_modules", ".next", ".turbo", "dist", "coverage"])
const PATTERN = /HTAG_API_KEY|@my-ba\/htag-client/

const offenders = []
function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue
    const path = join(dir, name)
    if (statSync(path).isDirectory()) walk(path)
    else if (!/\.(png|jpe?g|gif|ico|webp|woff2?|ttf)$/.test(name)) {
      readFileSync(path, "utf8")
        .split("\n")
        .forEach((line, index) => {
          if (PATTERN.test(line))
            offenders.push(`${relative(ROOT, path)}:${index + 1}: ${line.trim()}`)
        })
    }
  }
}
walk(WEB)

if (offenders.length > 0) {
  console.error("HtAG must stay server-side (P1-1 AC 11). Found in apps/web:")
  for (const offender of offenders) console.error(`  ${offender}`)
  process.exit(1)
}
console.log("check-web-htag-boundary: apps/web is clean")
