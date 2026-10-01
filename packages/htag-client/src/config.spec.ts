import { describe, expect, it } from "vitest"
import { htagClientConfigFromEnv, htagClientConfigSchema } from "./config"

describe("config", () => {
  it("requires HTAG_API_KEY", () => {
    expect(() => htagClientConfigFromEnv({})).toThrow(/HTAG_API_KEY/)
  })

  it("defaults to production, 100-row pages, 3 attempts", () => {
    const config = htagClientConfigSchema.parse(htagClientConfigFromEnv({ HTAG_API_KEY: "k" }))
    expect(config).toMatchObject({
      baseUrl: "https://api.htagai.com/v1",
      pageSize: 100,
      maxAttempts: 3,
    })
    expect(config.tierRatesAud.restricted).toBe(0.222)
  })

  it("accepts the dev server and trims a trailing slash", () => {
    const config = htagClientConfigSchema.parse(
      htagClientConfigFromEnv({
        HTAG_API_KEY: "k",
        HTAG_BASE_URL: "https://api.dev.htagai.com/v1/",
      }),
    )
    expect(config.baseUrl).toBe("https://api.dev.htagai.com/v1")
  })

  it("caps GET page size at the spec's 1000", () => {
    expect(() => htagClientConfigSchema.parse({ apiKey: "k", pageSize: 1001 })).toThrow()
  })
})
