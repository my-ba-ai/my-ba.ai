import type { AuState } from "@my-ba/shared"
import { createHash } from "node:crypto"
import { inflateRawSync } from "node:zlib"

/**
 * The ABS 2021 Census DataPack P1-10 loads (D72). Pinned by size and SHA-256:
 * the readers below are deliberately narrow (no general CSV quoting, no
 * general XLSX model), which is only safe because the input can never change
 * underneath them. A different file fails the checksum before anything is
 * parsed. Downloaded by hand into gitignored `data/abs/` — see
 * docs/05-roadmap-and-phases.md, P1-10 "Source verified".
 */
export const ABS_TENURE_DATAPACK = {
  fileName: "2021_GCP_SAL_for_AUS_short-header.zip",
  release:
    "2021 Census General Community Profile, Suburbs and Localities (SAL), all of Australia, short headers",
  bytes: 102_626_503,
  sha256: "940c57082442cad68e7399ab7c5eab6fd690ec8e8b68ce9799b02d69b9b7bdba",
  censusYear: 2021,
  tenureEntry: "2021 Census GCP Suburbs and Localities for AUS/2021Census_G37_AUST_SAL.csv",
  geographyEntry: "Metadata/2021Census_geog_desc_1st_2nd_3rd_release.xlsx",
  geographySheet: "2021_ASGS_Non_ABS_Structures",
} as const

/** G37 "Tenure and landlord type by dwelling structure", totals across dwelling structure. */
export const G37_COLUMNS = {
  salCode: "SAL_CODE_2021",
  rented: "R_Tot_Total",
  tenureNotStated: "Ten_type_NS_Total",
  occupiedPrivateDwellings: "Total_Total",
} as const

export class AbsDataPackError extends Error {
  override readonly name = "AbsDataPackError"
}

/* ------------------------------------------------------------- checksum */

export function verifyDataPack(
  zip: Buffer,
  expected: { bytes: number; sha256: string } = ABS_TENURE_DATAPACK,
): string {
  const sha256 = createHash("sha256").update(zip).digest("hex")
  if (zip.length !== expected.bytes || sha256 !== expected.sha256) {
    throw new AbsDataPackError(
      `DataPack checksum mismatch: got ${zip.length} bytes, sha256 ${sha256}; ` +
        `expected ${expected.bytes} bytes, sha256 ${expected.sha256}. ` +
        "Re-download the file, or record the new release in D72 before changing the pin.",
    )
  }
  return sha256
}

/* ------------------------------------------------------------------ zip */

const EOCD_SIGNATURE = 0x06054b50
const CENTRAL_SIGNATURE = 0x02014b50
const LOCAL_SIGNATURE = 0x04034b50

/**
 * Reads one entry out of a zip archive with `node:zlib` (stored or deflate
 * only, no ZIP64, no encryption). Enough for the DataPack and the XLSX inside
 * it, and no new dependency for a one-off loader.
 */
export function readZipEntry(zip: Buffer, name: string): Buffer {
  // End of central directory: fixed 22 bytes plus a comment of up to 64 KiB.
  let eocd = -1
  for (let offset = zip.length - 22; offset >= Math.max(0, zip.length - 22 - 0xffff); offset--) {
    if (zip.readUInt32LE(offset) === EOCD_SIGNATURE) {
      eocd = offset
      break
    }
  }
  if (eocd < 0) throw new AbsDataPackError("Not a zip archive (no end-of-central-directory record)")

  const entries = zip.readUInt16LE(eocd + 10)
  let cursor = zip.readUInt32LE(eocd + 16)
  for (let index = 0; index < entries; index++) {
    if (zip.readUInt32LE(cursor) !== CENTRAL_SIGNATURE) {
      throw new AbsDataPackError(`Corrupt central directory at byte ${cursor}`)
    }
    const method = zip.readUInt16LE(cursor + 10)
    const compressedSize = zip.readUInt32LE(cursor + 20)
    const nameLength = zip.readUInt16LE(cursor + 28)
    const extraLength = zip.readUInt16LE(cursor + 30)
    const commentLength = zip.readUInt16LE(cursor + 32)
    const localOffset = zip.readUInt32LE(cursor + 42)
    const entryName = zip.toString("utf8", cursor + 46, cursor + 46 + nameLength)

    if (entryName === name) {
      if (zip.readUInt32LE(localOffset) !== LOCAL_SIGNATURE) {
        throw new AbsDataPackError(`Corrupt local header for ${name}`)
      }
      const dataStart =
        localOffset + 30 + zip.readUInt16LE(localOffset + 26) + zip.readUInt16LE(localOffset + 28)
      const data = zip.subarray(dataStart, dataStart + compressedSize)
      if (method === 0) return Buffer.from(data)
      if (method === 8) return inflateRawSync(data)
      throw new AbsDataPackError(`Unsupported zip compression method ${method} for ${name}`)
    }
    cursor += 46 + nameLength + extraLength + commentLength
  }
  throw new AbsDataPackError(`Entry not found in archive: ${name}`)
}

/* ------------------------------------------------------------------ G37 */

export interface SalTenureCounts {
  salCode: string
  rentedDwellings: number
  tenureNotStated: number
  occupiedPrivateDwellings: number
}

const count = (value: string | undefined, column: string, line: number): number => {
  if (value === undefined || !/^\d+$/.test(value)) {
    throw new AbsDataPackError(
      `G37 line ${line}: ${column} is not a non-negative integer (${value})`,
    )
  }
  return Number(value)
}

/**
 * G37 is all integers plus the SAL code: no quoting, no embedded commas. The
 * reader fails loudly on a missing column rather than guessing (P1-10 AC 2).
 */
export function parseG37Csv(csv: string): SalTenureCounts[] {
  const lines = csv
    .replace(/^﻿/, "")
    .split(/\r?\n/)
    .filter((line) => line.length > 0)
  const header = (lines[0] ?? "").split(",")
  const indexOf = (column: string) => {
    const index = header.indexOf(column)
    if (index < 0) throw new AbsDataPackError(`G37 is missing column ${column}`)
    return index
  }
  const columns = {
    salCode: indexOf(G37_COLUMNS.salCode),
    rented: indexOf(G37_COLUMNS.rented),
    notStated: indexOf(G37_COLUMNS.tenureNotStated),
    occupied: indexOf(G37_COLUMNS.occupiedPrivateDwellings),
  }

  return lines.slice(1).map((line, index) => {
    const cells = line.split(",")
    const lineNumber = index + 2
    const salCode = cells[columns.salCode] ?? ""
    if (!/^SAL\d{5}$/.test(salCode)) {
      throw new AbsDataPackError(`G37 line ${lineNumber}: bad SAL code ${salCode}`)
    }
    return {
      salCode,
      rentedDwellings: count(cells[columns.rented], G37_COLUMNS.rented, lineNumber),
      tenureNotStated: count(cells[columns.notStated], G37_COLUMNS.tenureNotStated, lineNumber),
      occupiedPrivateDwellings: count(
        cells[columns.occupied],
        G37_COLUMNS.occupiedPrivateDwellings,
        lineNumber,
      ),
    }
  })
}

/**
 * D72: below this many dwellings with a stated tenure, the proportion is
 * null. ABS perturbs small cells, so in a locality of a dozen dwellings the
 * noise is the same size as the signal. Null means "factor missing" to P1-8,
 * which is the honest answer. 1,651 SALs in the 2021 pack fall under 10.
 */
export const MIN_TENURE_DWELLINGS = 20

/**
 * D72: rented ÷ (occupied private dwellings − tenure not stated), as a 0–1
 * fraction (P1-8 `renterProportion`).
 *
 * Null when fewer than MIN_TENURE_DWELLINGS dwellings stated a tenure (this
 * covers zero and negative denominators), and when the ratio leaves [0, 1]. The second case is real: ABS perturbs small
 * cells to protect privacy, so a locality with 3 occupied dwellings can report
 * 5 rented. 37 SALs in the 2021 pack do this; a fraction above 1 is noise, not
 * data.
 */
export function renterProportion(counts: Omit<SalTenureCounts, "salCode">): number | null {
  const denominator = counts.occupiedPrivateDwellings - counts.tenureNotStated
  if (denominator < MIN_TENURE_DWELLINGS) return null
  const fraction = counts.rentedDwellings / denominator
  return fraction >= 0 && fraction <= 1 ? fraction : null
}

/* ---------------------------------------------------------------- state */

/** The first digit of an ASGS 2021 SAL code is the state. `9` is Other Territories. */
const SAL_STATE_DIGITS: Readonly<Record<string, AuState>> = {
  "1": "NSW",
  "2": "VIC",
  "3": "QLD",
  "4": "SA",
  "5": "WA",
  "6": "TAS",
  "7": "NT",
  "8": "ACT",
}

/** Null for Other Territories (Jervis Bay, Christmas Island, …): not in `AU_STATES`. */
export function stateForSalCode(salCode: string): AuState | null {
  return SAL_STATE_DIGITS[salCode.charAt(3)] ?? null
}

/* ----------------------------------------------------------------- xlsx */

const XML_ENTITIES: Readonly<Record<string, string>> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
}

function decodeXml(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity.startsWith("#x") || entity.startsWith("#X")) {
      return String.fromCodePoint(Number.parseInt(entity.slice(2), 16))
    }
    if (entity.startsWith("#")) return String.fromCodePoint(Number(entity.slice(1)))
    return XML_ENTITIES[entity] ?? match
  })
}

/** Concatenated `<t>` runs, so rich-text strings read as plain text. */
const textOf = (xml: string) =>
  decodeXml([...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => m[1] ?? "").join(""))

/**
 * One worksheet of an XLSX as rows of `{ columnLetter: value }`. Handles
 * shared strings, inline strings and plain values; ignores formulas and
 * styles. Narrow on purpose (see ABS_TENURE_DATAPACK).
 */
export function readXlsxSheet(xlsx: Buffer, sheetName: string): Array<Record<string, string>> {
  const workbook = readZipEntry(xlsx, "xl/workbook.xml").toString("utf8")
  const rels = readZipEntry(xlsx, "xl/_rels/workbook.xml.rels").toString("utf8")

  const sheet = [...workbook.matchAll(/<sheet\b[^>]*>/g)]
    .map((m) => m[0])
    .find((tag) => tag.includes(`name="${sheetName}"`))
  const relId = sheet?.match(/r:id="([^"]+)"/)?.[1]
  if (!relId) throw new AbsDataPackError(`Worksheet not found: ${sheetName}`)
  const relationship = [...rels.matchAll(/<Relationship\b[^>]*>/g)]
    .map((m) => m[0])
    .find((tag) => tag.includes(`Id="${relId}"`))
  const target = relationship?.match(/Target="([^"]+)"/)?.[1]
  if (!target) throw new AbsDataPackError(`Worksheet relationship not found: ${relId}`)
  const sheetPath = target.startsWith("/") ? target.slice(1) : `xl/${target}`

  let sharedStrings: string[] = []
  try {
    const xml = readZipEntry(xlsx, "xl/sharedStrings.xml").toString("utf8")
    sharedStrings = [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1] ?? ""))
  } catch (error) {
    if (!(error instanceof AbsDataPackError)) throw error
  }

  const sheetXml = readZipEntry(xlsx, sheetPath).toString("utf8")
  return [...sheetXml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)].map((row) => {
    const cells: Record<string, string> = {}
    for (const cell of (row[1] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attributes = cell[1] ?? ""
      const inner = cell[2] ?? ""
      const column = attributes.match(/\br="([A-Z]+)\d+"/)?.[1]
      if (!column) continue
      const type = attributes.match(/\bt="([^"]+)"/)?.[1]
      const raw = inner.match(/<v>([\s\S]*?)<\/v>/)?.[1]
      if (type === "s") cells[column] = sharedStrings[Number(raw)] ?? ""
      else if (type === "inlineStr") cells[column] = textOf(inner)
      else if (raw !== undefined) cells[column] = decodeXml(raw)
    }
    return cells
  })
}

/* ------------------------------------------------------------ SAL names */

export interface SalName {
  salCode: string
  /** ABS name verbatim, disambiguator included: `Paddington (NSW)`, `Ascot (Ballarat - Vic.)`. */
  name: string
}

/** SAL rows from the geography descriptor's non-ABS-structures sheet, located by header name. */
export function parseSalNames(
  xlsx: Buffer,
  sheetName: string = ABS_TENURE_DATAPACK.geographySheet,
): SalName[] {
  const [header, ...rows] = readXlsxSheet(xlsx, sheetName)
  const columnFor = (title: string) => {
    const column = Object.entries(header ?? {}).find(([, value]) => value === title)?.[0]
    if (!column) throw new AbsDataPackError(`Geography sheet is missing column ${title}`)
    return column
  }
  const structure = columnFor("ASGS_Structure")
  const code = columnFor("Census_Code_2021")
  const name = columnFor("Census_Name_2021")

  return rows
    .filter((row) => row[structure] === "SAL")
    .map((row) => ({ salCode: row[code] ?? "", name: row[name] ?? "" }))
    .filter((row) => /^SAL\d{5}$/.test(row.salCode) && row.name.length > 0)
}

/* ----------------------------------------------------------------- join */

export interface AbsSalTenureRow extends SalTenureCounts {
  censusYear: number
  name: string
  state: AuState
  renterProportion: number | null
}

export interface DataPackReadResult {
  rows: AbsSalTenureRow[]
  sha256: string
  /** SALs in G37 with no row in the geography descriptor. Expected 0. */
  missingNames: string[]
  /** Other Territories SALs, skipped: not an `AU_STATES` value. */
  skippedOtherTerritories: number
  /** Rows stored with a null proportion: under MIN_TENURE_DWELLINGS, or a perturbed fraction outside [0, 1]. */
  nullProportions: number
}

/** Verify, unpack, parse and join. Pure apart from the hashing; no I/O. */
export function readTenureDataPack(zip: Buffer): DataPackReadResult {
  const sha256 = verifyDataPack(zip)
  const counts = parseG37Csv(readZipEntry(zip, ABS_TENURE_DATAPACK.tenureEntry).toString("utf8"))
  const names = new Map(
    parseSalNames(readZipEntry(zip, ABS_TENURE_DATAPACK.geographyEntry)).map((row) => [
      row.salCode,
      row.name,
    ]),
  )
  return joinTenure(counts, names, sha256)
}

export function joinTenure(
  counts: readonly SalTenureCounts[],
  names: ReadonlyMap<string, string>,
  sha256: string,
): DataPackReadResult {
  const rows: AbsSalTenureRow[] = []
  const missingNames: string[] = []
  let skippedOtherTerritories = 0
  let nullProportions = 0

  for (const row of counts) {
    const state = stateForSalCode(row.salCode)
    if (!state) {
      skippedOtherTerritories++
      continue
    }
    const name = names.get(row.salCode)
    if (!name) {
      missingNames.push(row.salCode)
      continue
    }
    const proportion = renterProportion(row)
    if (proportion === null) nullProportions++
    rows.push({
      ...row,
      censusYear: ABS_TENURE_DATAPACK.censusYear,
      name,
      state,
      renterProportion: proportion,
    })
  }
  return { rows, sha256, missingNames, skippedOtherTerritories, nullProportions }
}
