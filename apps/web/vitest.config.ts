import { fileURLToPath } from "node:url"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vitest/config"

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: "@", replacement: fileURLToPath(new URL("./src", import.meta.url)) },
      // Mirrors tsconfig `paths`: the bare `cn` import (vendored shadcn
      // components) gets the design-system-aware instance (D70). Exact match
      // only, so `cn/config` inside that module still reaches the package.
      {
        find: /^cn$/,
        replacement: fileURLToPath(new URL("./src/lib/utils.ts", import.meta.url)),
      },
    ],
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./src/test/setup.ts"],
  },
})
