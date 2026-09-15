import { z } from "zod"

const envSchema = z.object({
  /** Application connection. Must be a NOSUPERUSER/NOBYPASSRLS role. */
  DATABASE_URL: z.string().min(1),
  /** Schema owner. Only `pnpm db:migrate` and drizzle-kit use this. */
  DATABASE_MIGRATION_URL: z.string().min(1).optional(),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),
})

export type DbEnv = z.infer<typeof envSchema>

/**
 * Loads `.env.local` then `.env` if present. Node 22 can do this natively, so
 * the standalone scripts do not need dotenv; the Nest apps keep using
 * @nestjs/config and pass values in explicitly.
 */
export function loadEnvFiles(cwd: string = process.cwd()): void {
  for (const file of [".env.local", ".env"]) {
    try {
      process.loadEnvFile(`${cwd}/${file}`)
    } catch {
      // Absent file is the normal case in CI and in containers.
    }
  }
}

export function parseDbEnv(source: NodeJS.ProcessEnv = process.env): DbEnv {
  return envSchema.parse(source)
}
