import { defineConfig } from "vitest/config"

/**
 * `*.integration.spec.ts` needs the docker Postgres (`pnpm db:up && pnpm
 * db:migrate`) and spawns child processes, so it only runs under
 * `pnpm --filter @my-ba/orchestrator test:integration`, which CI runs in its
 * own `integration` job (P0-7). The plain `test` task stays hermetic.
 */
const integration = process.env.INTEGRATION === "1"

export default defineConfig({
  test: {
    environment: "node",
    include: integration ? ["src/**/*.integration.spec.ts"] : ["src/**/*.spec.ts"],
    exclude: integration ? [] : ["src/**/*.integration.spec.ts", "node_modules/**"],
    // Each integration case spawns up to three tsx processes.
    testTimeout: integration ? 60_000 : 5_000,
    fileParallelism: !integration,
  },
})
