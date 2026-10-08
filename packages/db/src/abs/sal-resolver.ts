import type { AuState } from "@my-ba/shared"
import type { SalMatchMethod } from "../schema/suburbs"
import { salCandidates, type SalNameIndex } from "./sal-match"

/** What the resolver needs from HtAG: `/reference/concordance/sal-to-locality` for one code. */
export type SalToLocalityLookup = (
  salCode: string,
) => Promise<{ locPid: string; postcode: string | null } | null>

export interface SuburbToResolve {
  /** HtAG `loc_pid`. */
  htagAreaId: string
  /** HtAG `area_name`, e.g. `SURRY HILLS`. */
  name: string
  state: AuState
}

export type SalResolution =
  | {
      salCode: string
      method: Exclude<SalMatchMethod, "unmatched">
      /** From the concordance response. Null for a name match: ABS SALs carry no postcode. */
      postcode: string | null
      /** HtAG calls made for this suburb. */
      lookups: number
    }
  | { salCode: null; method: "unmatched"; candidates: number; lookups: number }

export interface SalResolver {
  resolve(suburb: SuburbToResolve): Promise<SalResolution>
}

/**
 * D72, per suburb:
 *
 * 1. Normalised name within the state (free). Exactly one SAL → done.
 * 2. Several SALs share the name → ask HtAG which one maps to this `loc_pid`,
 *    one candidate at a time, stopping at the first hit. Sequential on
 *    purpose: every call is billed, and the first candidate usually answers.
 * 3. No SAL has the name, or no candidate maps back → `unmatched`. Zero
 *    candidates makes no call: there is no code to ask about (AC 5).
 *
 * The lookup is injected so this package stays free of the HtAG client;
 * the caller binds it to a client recording spend against the system tenant.
 */
export function createSalResolver(deps: {
  index: SalNameIndex
  lookup: SalToLocalityLookup
}): SalResolver {
  return {
    async resolve(suburb) {
      const candidates = salCandidates(deps.index, suburb.state, suburb.name)
      if (candidates.length === 1) {
        return { salCode: candidates[0] as string, method: "name", postcode: null, lookups: 0 }
      }

      const tryCandidate = async (position: number): Promise<SalResolution> => {
        const salCode = candidates[position]
        if (salCode === undefined) {
          return {
            salCode: null,
            method: "unmatched",
            candidates: candidates.length,
            lookups: position,
          }
        }
        const hit = await deps.lookup(salCode)
        if (hit?.locPid === suburb.htagAreaId) {
          return {
            salCode,
            method: "htag_concordance",
            postcode: hit.postcode,
            lookups: position + 1,
          }
        }
        return tryCandidate(position + 1)
      }
      return tryCandidate(0)
    },
  }
}
