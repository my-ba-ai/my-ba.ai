import { readFileSync } from "node:fs"
import path from "node:path"
import { ABS_TENURE_DATAPACK, readTenureDataPack } from "../abs/datapack"
import { upsertAbsSalTenure } from "../abs/repository"
import { createDatabase, createPool } from "../client"
import { loadEnvFiles, parseDbEnv } from "../env"

/**
 * `pnpm abs:load [path/to/datapack.zip]` — P1-10, D72.
 *
 * One-off and idempotent, like `pnpm db:migrate`: Census tenure changes every
 * five years, so there is no scheduled job. Re-running over the same file
 * writes nothing. Runs as the app role inside `withSystemTenant`, the only
 * way RLS lets anyone write reference data.
 *
 * The DataPack is not in git (it is ~100 MB and ABS-licensed CC BY 4.0, not
 * ours to redistribute in the repo). Download it into `data/abs/`; the file is
 * verified against the pinned size and SHA-256 before anything is parsed.
 */
const REPO_ROOT = path.resolve(__dirname, "../../../..")

function log(message: string): void {
  console.log(`[abs:load] ${message}`)
}

async function main(): Promise<void> {
  loadEnvFiles(path.resolve(__dirname, "../.."))
  const env = parseDbEnv()

  const file = path.resolve(
    process.cwd(),
    process.argv[2] ?? path.join(REPO_ROOT, "data/abs", ABS_TENURE_DATAPACK.fileName),
  )
  log(`reading ${path.relative(REPO_ROOT, file)}`)
  let zip: Buffer
  try {
    zip = readFileSync(file)
  } catch (error) {
    throw new Error(
      `Cannot read ${file}. Download ${ABS_TENURE_DATAPACK.fileName} from the ABS Census DataPacks page ` +
        "(2021, General Community Profile, Suburbs and Localities, Australia, short headers) into data/abs/.",
      { cause: error },
    )
  }

  const pack = readTenureDataPack(zip)
  log(`checksum ok (${pack.sha256.slice(0, 12)}…)`)
  log(
    `${pack.rows.length} SALs parsed; ${pack.skippedOtherTerritories} Other Territories skipped; ` +
      `${pack.nullProportions} with no renter proportion (empty or ABS-perturbed)`,
  )
  if (pack.missingNames.length > 0) {
    throw new Error(
      `${pack.missingNames.length} SALs in G37 have no name in the geography descriptor ` +
        `(first: ${pack.missingNames.slice(0, 5).join(", ")}). Refusing to load a partial join.`,
    )
  }

  const pool = createPool({
    connectionString: env.DATABASE_URL,
    max: 1,
    applicationName: "my-ba-abs-load",
  })
  try {
    const { written } = await upsertAbsSalTenure(createDatabase(pool), pack.rows, pack.sha256)
    log(written === 0 ? "already up to date (0 rows written)" : `${written} rows written`)
  } finally {
    await pool.end()
  }
}

main().catch((error: unknown) => {
  console.error("\n[abs:load] failed\n")
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
