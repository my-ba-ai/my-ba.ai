import { describe, expect, it } from "vitest"
import { DEFAULT_SCREENING_CONFIG, screeningConfigFromEnv } from "./config"

describe("screeningConfigFromEnv", () => {
  it("defaults to the priced shape (limit 100, top 6)", () => {
    expect(screeningConfigFromEnv({})).toEqual(DEFAULT_SCREENING_CONFIG)
  })

  it("AC 8 / Q04: SCREEN_STATES_OVERRIDE narrows states in dev", () => {
    expect(
      screeningConfigFromEnv({ SCREEN_STATES_OVERRIDE: " nsw, QLD ,nsw" }).statesOverride,
    ).toEqual(["NSW", "QLD"])
    expect(screeningConfigFromEnv({ SCREEN_STATES_OVERRIDE: "" }).statesOverride).toBeNull()
  })

  it("rejects unknown states and refuses the override in production", () => {
    expect(() => screeningConfigFromEnv({ SCREEN_STATES_OVERRIDE: "NZ" })).toThrow()
    expect(() =>
      screeningConfigFromEnv({ NODE_ENV: "production", SCREEN_STATES_OVERRIDE: "NSW" }),
    ).toThrow(/dev-only/)
  })

  it("reads the numeric knobs", () => {
    expect(
      screeningConfigFromEnv({
        SCREEN_QUERY_LIMIT: "80",
        SCREEN_RESTRICTED_TOP_N: "4",
        SCREEN_TREND_BATCH_SIZE: "25",
      }),
    ).toMatchObject({ queryLimit: 80, restrictedTopN: 4, trendBatchSize: 25 })
  })
})
