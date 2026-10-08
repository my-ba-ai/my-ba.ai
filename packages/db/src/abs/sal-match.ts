import type { AuState } from "@my-ba/shared"

/**
 * Name matching between HtAG localities and ABS SALs (P1-10, D72).
 *
 * HtAG names arrive upper-case (`SURRY HILLS`); ABS names are title-case and,
 * where a name repeats, carry a disambiguator: `Paddington (NSW)`,
 * `Ascot (Ballarat - Vic.)`. Both sides go through the same normalisation, so
 * the rules only need to be consistent, not clever:
 *
 * - a trailing parenthetical is dropped (ABS disambiguator);
 * - accents are folded, apostrophes removed (`O'Connor` → `OCONNOR`);
 * - any other run of non-alphanumerics becomes one space (`-`, `.`, `&`);
 * - upper-cased and trimmed.
 *
 * After normalisation 138 names repeat within a state in the 2021 pack. Those
 * are exactly the cases the HtAG concordance fallback is for.
 */
export function normaliseLocalityName(name: string): string {
  return name
    .replace(/\s*\([^)]*\)\s*$/, "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['’]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
}

export interface SalNameEntry {
  salCode: string
  name: string
  state: AuState
}

/** `state|NORMALISED NAME` → SAL codes. Several codes means the name is ambiguous in that state. */
export type SalNameIndex = ReadonlyMap<string, readonly string[]>

const key = (state: AuState, name: string) => `${state}|${normaliseLocalityName(name)}`

export function buildSalNameIndex(entries: Iterable<SalNameEntry>): SalNameIndex {
  const index = new Map<string, string[]>()
  for (const entry of entries) {
    const k = key(entry.state, entry.name)
    const codes = index.get(k)
    if (codes) codes.push(entry.salCode)
    else index.set(k, [entry.salCode])
  }
  for (const codes of index.values()) codes.sort()
  return index
}

/** SAL codes in `state` whose normalised name equals this one's. */
export function salCandidates(
  index: SalNameIndex,
  state: AuState,
  name: string,
): readonly string[] {
  return index.get(key(state, name)) ?? []
}
