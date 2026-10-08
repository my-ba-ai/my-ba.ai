import { describe, expect, it, vi } from "vitest"
import { buildSalNameIndex } from "./sal-match"
import { createSalResolver, type SalToLocalityLookup } from "./sal-resolver"

const index = buildSalNameIndex([
  { salCode: "SAL13714", name: "Surry Hills", state: "NSW" },
  { salCode: "SAL10139", name: "Alison (Central Coast - NSW)", state: "NSW" },
  { salCode: "SAL10140", name: "Alison (Dungog - NSW)", state: "NSW" },
])

const concordance: Record<string, { locPid: string; postcode: string | null }> = {
  SAL10139: { locPid: "NSW58", postcode: "2259" },
  SAL10140: { locPid: "NSW59", postcode: "2420" },
}

function setup() {
  const lookup = vi.fn<SalToLocalityLookup>(async (code) => concordance[code] ?? null)
  return { lookup, resolver: createSalResolver({ index, lookup }) }
}

describe("createSalResolver (P1-10, D72)", () => {
  it("a unique name match makes no HtAG call", async () => {
    const { lookup, resolver } = setup()
    await expect(
      resolver.resolve({ htagAreaId: "NSW3733", name: "SURRY HILLS", state: "NSW" }),
    ).resolves.toEqual({ salCode: "SAL13714", method: "name", postcode: null, lookups: 0 })
    expect(lookup).not.toHaveBeenCalled()
  })

  it("an ambiguous name asks HtAG per candidate and stops at the hit (AC 5)", async () => {
    const { lookup, resolver } = setup()
    await expect(
      resolver.resolve({ htagAreaId: "NSW58", name: "ALISON", state: "NSW" }),
    ).resolves.toEqual({
      salCode: "SAL10139",
      method: "htag_concordance",
      postcode: "2259",
      lookups: 1,
    })
    expect(lookup.mock.calls).toEqual([["SAL10139"]])
  })

  it("tries the next candidate when the first maps elsewhere", async () => {
    const { lookup, resolver } = setup()
    const result = await resolver.resolve({ htagAreaId: "NSW59", name: "ALISON", state: "NSW" })
    expect(result).toEqual({
      salCode: "SAL10140",
      method: "htag_concordance",
      postcode: "2420",
      lookups: 2,
    })
    expect(lookup).toHaveBeenCalledTimes(2)
  })

  it("an ambiguous name no candidate maps back to is unmatched", async () => {
    const { resolver } = setup()
    await expect(
      resolver.resolve({ htagAreaId: "NSW999", name: "ALISON", state: "NSW" }),
    ).resolves.toEqual({ salCode: null, method: "unmatched", candidates: 2, lookups: 2 })
  })

  it("zero candidates makes no call (AC 5)", async () => {
    const { lookup, resolver } = setup()
    await expect(
      resolver.resolve({ htagAreaId: "VIC1", name: "ABBEYARD", state: "VIC" }),
    ).resolves.toEqual({ salCode: null, method: "unmatched", candidates: 0, lookups: 0 })
    expect(lookup).not.toHaveBeenCalled()
  })

  it("a lookup error propagates (quota, balance): the caller decides", async () => {
    const lookup = vi.fn<SalToLocalityLookup>(async () => {
      throw new Error("429")
    })
    const resolver = createSalResolver({ index, lookup })
    await expect(
      resolver.resolve({ htagAreaId: "NSW58", name: "ALISON", state: "NSW" }),
    ).rejects.toThrow("429")
  })
})
