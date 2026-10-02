import { FACTOR_IDS, normaliseWeights, sumWeights } from "@my-ba/domain"
import {
  type CriteriaFormValues,
  FILTER_DEFINITIONS,
  type FilterDefinition,
  type FilterFormValue,
} from "@/lib/criteria-form"

const aud = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
  maximumFractionDigits: 0,
})
const audCents = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" })
const number = new Intl.NumberFormat("en-AU", { maximumFractionDigits: 2 })

export const formatAud = (value: number) => aud.format(value)
export const formatAudCents = (value: number) => audCents.format(value)

const isSet = (n: number | undefined): n is number => n !== undefined && !Number.isNaN(n)

function formatValue(def: FilterDefinition, value: number): string {
  if (def.unit === "AUD") return formatAud(value)
  if (def.unit === "%") return `${number.format(value)}%`
  return `${number.format(value)} ${def.unit}`
}

/** One enabled filter as the review step shows it, e.g. "≤ 1.5%" or "$500,000 – $900,000". */
export function describeFilter(def: FilterDefinition, f: FilterFormValue): string | null {
  if (!f.enabled) return null
  if (def.kind === "range") {
    const min = isSet(f.min) ? formatValue(def, f.min) : null
    const max = isSet(f.max) ? formatValue(def, f.max) : null
    if (min && max) return `${min} – ${max}`
    if (min) return `≥ ${min}`
    if (max) return `≤ ${max}`
    return null
  }
  if (!isSet(f.value)) return null
  return `${def.kind === "max" ? "≤" : "≥"} ${formatValue(def, f.value)}`
}

export function enabledFilterSummaries(values: CriteriaFormValues) {
  return FILTER_DEFINITIONS.flatMap((def) => {
    const text = describeFilter(def, values.filters[def.field])
    return text ? [{ field: def.field, label: def.label, text }] : []
  })
}

/** Slider positions → the percentage each factor will carry after normalising. */
export function normalisedPercents(weights: CriteriaFormValues["weights"]) {
  if (sumWeights(weights) === 0) return null
  const n = normaliseWeights(weights)
  return Object.fromEntries(FACTOR_IDS.map((id) => [id, Math.round(n[id] * 1000) / 10])) as Record<
    (typeof FACTOR_IDS)[number],
    number
  >
}
