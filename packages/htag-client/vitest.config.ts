import { defineConfig } from "vitest/config"

/**
 * Hermetic: every test runs against recorded fixtures in `test/fixtures`
 * (P1-1 AC 1). There is no live-API suite and no key in the test env.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.spec.ts"],
  },
})
