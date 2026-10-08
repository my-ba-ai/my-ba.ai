import { describe, expect, it } from "vitest"
import { buildSalNameIndex, normaliseLocalityName, salCandidates } from "./sal-match"

describe("normaliseLocalityName (D72)", () => {
  it.each([
    ["Surry Hills", "SURRY HILLS"],
    ["SURRY HILLS", "SURRY HILLS"],
    ["Paddington (NSW)", "PADDINGTON"],
    ["Ascot (Ballarat - Vic.)", "ASCOT"],
    ["O'Connor (ACT)", "OCONNOR"],
    ["O’CONNOR", "OCONNOR"],
    ["Canterbury-Bankstown", "CANTERBURY BANKSTOWN"],
    ["  Mount   Lofty ", "MOUNT LOFTY"],
    ["Ngunnawal", "NGUNNAWAL"],
  ])("%s → %s", (input, expected) => expect(normaliseLocalityName(input)).toBe(expected))
})

describe("buildSalNameIndex / salCandidates", () => {
  const index = buildSalNameIndex([
    { salCode: "SAL13714", name: "Surry Hills", state: "NSW" },
    { salCode: "SAL11883", name: "Paddington (NSW)", state: "NSW" },
    { salCode: "SAL31883", name: "Paddington (Qld)", state: "QLD" },
    { salCode: "SAL10140", name: "Alison (Dungog - NSW)", state: "NSW" },
    { salCode: "SAL10139", name: "Alison (Central Coast - NSW)", state: "NSW" },
  ])

  it("matches upper-case HtAG names within the state", () => {
    expect(salCandidates(index, "NSW", "SURRY HILLS")).toEqual(["SAL13714"])
    expect(salCandidates(index, "NSW", "PADDINGTON")).toEqual(["SAL11883"])
    expect(salCandidates(index, "QLD", "PADDINGTON")).toEqual(["SAL31883"])
  })

  it("returns every SAL for a name repeated within a state, sorted", () => {
    expect(salCandidates(index, "NSW", "ALISON")).toEqual(["SAL10139", "SAL10140"])
  })

  it("returns nothing for an unknown name or the wrong state", () => {
    expect(salCandidates(index, "VIC", "SURRY HILLS")).toEqual([])
    expect(salCandidates(index, "NSW", "NOWHERE")).toEqual([])
  })
})
