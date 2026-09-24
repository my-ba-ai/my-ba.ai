import { defineConfig } from "vitest/config"

/**
 * `*.integration.spec.ts` needs the docker Postgres (`pnpm db:up && pnpm
 * db:migrate`) and connects as the app role, so it only runs under
 * `pnpm test:integration`, which CI runs in its own `integration` job (P0-7).
 * The plain `test` task stays hermetic. Same split as packages/orchestrator.
 */
const integration = process.env.INTEGRATION === "1"

export default defineConfig({
  test: {
    environment: "node",
    include: integration ? ["src/**/*.integration.spec.ts"] : ["src/**/*.spec.ts"],
    exclude: integration ? [] : ["src/**/*.integration.spec.ts", "node_modules/**"],
    testTimeout: integration ? 30_000 : 5_000,
    fileParallelism: !integration,
  },
})
