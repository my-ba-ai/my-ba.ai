import { describe, expect, it } from "vitest"
import { htagCallRecordSchema } from "./htag-call"

const base = {
  endpoint: "/markets/trends/days-on-market",
  request: { level: "suburb", area_id: "ACT101" },
  tier: "restricted",
  statusCode: 200,
  rowsReturned: 3,
  costAud: "0.666",
  costSource: "header",
  billedUnits: 3,
  billingBalanceAud: "24.334",
  billingTier: "tier1",
} as const

describe("htagCallRecordSchema", () => {
  it("accepts a billed 2xx attempt", () => {
    expect(htagCallRecordSchema.parse(base)).toEqual(base)
  })

  it("accepts a network error: no status, nothing charged", () => {
    const call = {
      ...base,
      statusCode: null,
      rowsReturned: 0,
      costAud: "0",
      costSource: "none",
      billedUnits: null,
      billingBalanceAud: null,
      billingTier: null,
    }
    expect(htagCallRecordSchema.parse(call)).toEqual(call)
  })

  it("rejects a negative or non-decimal cost", () => {
    expect(() => htagCallRecordSchema.parse({ ...base, costAud: "-1" })).toThrow()
    expect(() => htagCallRecordSchema.parse({ ...base, costAud: "0.1.2" })).toThrow()
  })

  it("rejects a billing tier HtAG does not send", () => {
    expect(() => htagCallRecordSchema.parse({ ...base, billingTier: "tier9" })).toThrow()
  })
})
