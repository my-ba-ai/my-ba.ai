import { defineConfig } from "vitest/config"

/** Pure domain logic (P1-8): no I/O, no env, no fixtures. */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.spec.ts"],
  },
})
