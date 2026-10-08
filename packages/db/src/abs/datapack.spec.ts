import { createHash } from "node:crypto"
import { crc32, deflateRawSync } from "node:zlib"
import { describe, expect, it } from "vitest"
import {
  AbsDataPackError,
  joinTenure,
  MIN_TENURE_DWELLINGS,
  parseG37Csv,
  parseSalNames,
  readXlsxSheet,
  readZipEntry,
  renterProportion,
  stateForSalCode,
  verifyDataPack,
} from "./datapack"

/** Minimal zip writer (deflate, no ZIP64) — enough to exercise readZipEntry. */
function zip(entries: Record<string, string | Buffer>): Buffer {
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0
  for (const [name, content] of Object.entries(entries)) {
    const data = Buffer.isBuffer(content) ? content : Buffer.from(content, "utf8")
    const compressed = deflateRawSync(data)
    const nameBytes = Buffer.from(name, "utf8")
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(8, 8)
    local.writeUInt32LE(crc32(data), 14)
    local.writeUInt32LE(compressed.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(nameBytes.length, 26)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(8, 10)
    central.writeUInt32LE(crc32(data), 16)
    central.writeUInt32LE(compressed.length, 20)
    central.writeUInt32LE(data.length, 24)
    central.writeUInt16LE(nameBytes.length, 28)
    central.writeUInt32LE(offset, 42)
    locals.push(local, nameBytes, compressed)
    centrals.push(central, nameBytes)
    offset += local.length + nameBytes.length + compressed.length
  }
  const centralDirectory = Buffer.concat(centrals)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(Object.keys(entries).length, 8)
  eocd.writeUInt16LE(Object.keys(entries).length, 10)
  eocd.writeUInt32LE(centralDirectory.length, 12)
  eocd.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, centralDirectory, eocd])
}

/** A two-sheet workbook shaped like the ABS geography descriptor. */
function geographyXlsx(): Buffer {
  const strings = [
    "ASGS_Structure",
    "Census_Code_2021",
    "Census_Name_2021",
    "SAL",
    "Paddington (NSW)",
    "CED",
    "O&apos;Connor (ACT)",
  ]
  const sst = `<sst>${strings.map((s) => `<si><t>${s}</t></si>`).join("")}</sst>`
  const sheet = `<worksheet><sheetData>
    <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="D1" t="s"><v>2</v></c></row>
    <row r="2"><c r="A2" t="s"><v>3</v></c><c r="B2" t="inlineStr"><is><t>SAL11883</t></is></c><c r="D2" t="s"><v>4</v></c><c r="E2"><v>1.5</v></c></row>
    <row r="3"><c r="A3" t="s"><v>5</v></c><c r="B3" t="inlineStr"><is><t>CED101</t></is></c><c r="D3" t="inlineStr"><is><t>Banks</t></is></c></row>
    <row r="4"><c r="A4" t="s"><v>3</v></c><c r="B4" t="inlineStr"><is><t>SAL80094</t></is></c><c r="D4" t="s"><v>6</v></c></row>
  </sheetData></worksheet>`
  return zip({
    "xl/workbook.xml": `<workbook><sheets><sheet name="Other" sheetId="1" r:id="rId1"/><sheet name="2021_ASGS_Non_ABS_Structures" sheetId="2" r:id="rId2"/></sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>`,
    "xl/sharedStrings.xml": sst,
    "xl/worksheets/sheet1.xml": "<worksheet><sheetData/></worksheet>",
    "xl/worksheets/sheet2.xml": sheet,
  })
}

const G37_HEADER = "SAL_CODE_2021,O_OR_Total,R_Tot_Total,Ten_type_NS_Total,Total_Total"

describe("renterProportion (P1-10 AC 6, D72)", () => {
  it("is rented ÷ (occupied − not stated)", () => {
    // Surry Hills, SAL13714, 2021 G37.
    expect(
      renterProportion({
        rentedDwellings: 5088,
        tenureNotStated: 100,
        occupiedPrivateDwellings: 7776,
      }),
    ).toBe(5088 / 7676)
  })

  it("excludes not-stated from the denominator, not from the numerator", () => {
    expect(
      renterProportion({ rentedDwellings: 30, tenureNotStated: 20, occupiedPrivateDwellings: 120 }),
    ).toBe(0.3)
  })

  it("is null for a zero denominator", () => {
    expect(
      renterProportion({ rentedDwellings: 0, tenureNotStated: 0, occupiedPrivateDwellings: 0 }),
    ).toBeNull()
    expect(
      renterProportion({ rentedDwellings: 0, tenureNotStated: 4, occupiedPrivateDwellings: 4 }),
    ).toBeNull()
  })

  it("is null for a negative denominator (perturbed not-stated above total)", () => {
    expect(
      renterProportion({ rentedDwellings: 0, tenureNotStated: 6, occupiedPrivateDwellings: 3 }),
    ).toBeNull()
  })

  it("is null when ABS perturbation pushes rented above the denominator", () => {
    // SAL10294: 5 rented of 3 occupied.
    expect(
      renterProportion({ rentedDwellings: 5, tenureNotStated: 0, occupiedPrivateDwellings: 3 }),
    ).toBeNull()
  })

  it("allows the 0 and 1 edges", () => {
    expect(
      renterProportion({ rentedDwellings: 0, tenureNotStated: 0, occupiedPrivateDwellings: 40 }),
    ).toBe(0)
    expect(
      renterProportion({ rentedDwellings: 40, tenureNotStated: 1, occupiedPrivateDwellings: 41 }),
    ).toBe(1)
  })

  it(`is null below ${MIN_TENURE_DWELLINGS} dwellings with a stated tenure, counted after not-stated`, () => {
    expect(MIN_TENURE_DWELLINGS).toBe(20)
    expect(
      renterProportion({ rentedDwellings: 5, tenureNotStated: 0, occupiedPrivateDwellings: 19 }),
    ).toBeNull()
    expect(
      renterProportion({ rentedDwellings: 5, tenureNotStated: 0, occupiedPrivateDwellings: 20 }),
    ).toBe(0.25)
    expect(
      renterProportion({ rentedDwellings: 5, tenureNotStated: 5, occupiedPrivateDwellings: 24 }),
    ).toBeNull()
  })
})

describe("parseG37Csv", () => {
  it("reads the three columns by header name", () => {
    expect(parseG37Csv(`﻿${G37_HEADER}\r\nSAL13714,9,5088,100,7776\r\n`)).toEqual([
      {
        salCode: "SAL13714",
        rentedDwellings: 5088,
        tenureNotStated: 100,
        occupiedPrivateDwellings: 7776,
      },
    ])
  })

  it("fails loudly on a missing column (AC 2)", () => {
    expect(() => parseG37Csv("SAL_CODE_2021,R_Tot_Total,Total_Total\nSAL13714,1,2")).toThrow(
      /missing column Ten_type_NS_Total/,
    )
  })

  it("fails on a non-integer count or a bad code", () => {
    expect(() => parseG37Csv(`${G37_HEADER}\nSAL13714,1,x,0,2`)).toThrow(AbsDataPackError)
    expect(() => parseG37Csv(`${G37_HEADER}\nPOA2010,1,1,0,2`)).toThrow(/bad SAL code/)
  })
})

describe("stateForSalCode", () => {
  it.each([
    ["SAL13714", "NSW"],
    ["SAL20001", "VIC"],
    ["SAL30001", "QLD"],
    ["SAL40001", "SA"],
    ["SAL50001", "WA"],
    ["SAL60001", "TAS"],
    ["SAL70001", "NT"],
    ["SAL80001", "ACT"],
  ])("%s → %s", (code, state) => expect(stateForSalCode(code)).toBe(state))

  it("Other Territories → null", () => expect(stateForSalCode("SAL90001")).toBeNull())
})

describe("zip + xlsx readers", () => {
  it("reads a deflated entry and reports a missing one", () => {
    const archive = zip({ "a/b.csv": "hello", "c.txt": "world" })
    expect(readZipEntry(archive, "a/b.csv").toString()).toBe("hello")
    expect(() => readZipEntry(archive, "nope")).toThrow(/Entry not found/)
    expect(() => readZipEntry(Buffer.from("not a zip at all, no EOCD here"), "x")).toThrow(
      /Not a zip/,
    )
  })

  it("reads a named sheet with shared, inline and plain values", () => {
    const rows = readXlsxSheet(geographyXlsx(), "2021_ASGS_Non_ABS_Structures")
    expect(rows[1]).toEqual({ A: "SAL", B: "SAL11883", D: "Paddington (NSW)", E: "1.5" })
    expect(() => readXlsxSheet(geographyXlsx(), "Missing")).toThrow(/Worksheet not found/)
  })

  it("parseSalNames keeps SAL rows only and decodes entities", () => {
    expect(parseSalNames(geographyXlsx())).toEqual([
      { salCode: "SAL11883", name: "Paddington (NSW)" },
      { salCode: "SAL80094", name: "O'Connor (ACT)" },
    ])
  })
})

describe("verifyDataPack", () => {
  it("accepts the pinned size and hash, rejects anything else", () => {
    const file = Buffer.from("datapack")
    const sha256 = createHash("sha256").update(file).digest("hex")
    expect(verifyDataPack(file, { bytes: file.length, sha256 })).toBe(sha256)
    expect(() => verifyDataPack(file, { bytes: file.length, sha256: "0".repeat(64) })).toThrow(
      /checksum mismatch/,
    )
    expect(() => verifyDataPack(file)).toThrow(AbsDataPackError)
  })
})

describe("joinTenure", () => {
  it("joins names, derives state and proportion, skips Other Territories, reports gaps", () => {
    const counts = [
      {
        salCode: "SAL13714",
        rentedDwellings: 30,
        tenureNotStated: 20,
        occupiedPrivateDwellings: 120,
      },
      { salCode: "SAL90001", rentedDwellings: 1, tenureNotStated: 0, occupiedPrivateDwellings: 2 },
      { salCode: "SAL10294", rentedDwellings: 5, tenureNotStated: 0, occupiedPrivateDwellings: 3 },
      { salCode: "SAL20001", rentedDwellings: 1, tenureNotStated: 0, occupiedPrivateDwellings: 2 },
    ]
    const names = new Map([
      ["SAL13714", "Surry Hills"],
      ["SAL10294", "Somewhere Tiny"],
    ])
    const result = joinTenure(counts, names, "abc")
    expect(result.rows).toEqual([
      expect.objectContaining({
        salCode: "SAL13714",
        state: "NSW",
        name: "Surry Hills",
        censusYear: 2021,
        renterProportion: 0.3,
      }),
      expect.objectContaining({ salCode: "SAL10294", renterProportion: null }),
    ])
    expect(result.skippedOtherTerritories).toBe(1)
    expect(result.missingNames).toEqual(["SAL20001"])
    expect(result.nullProportions).toBe(1)
  })
})
