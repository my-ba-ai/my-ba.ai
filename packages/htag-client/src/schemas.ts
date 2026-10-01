import { htagPropertyTypeSchema } from "@my-ba/shared"
import { z } from "zod"

/*
 * Row schemas, hand-written against docs/htag/openapi.json (D61). Where the
 * captured fixtures contradict the spec, the fixtures win:
 *
 * - The yield trend field is `yield_val` (spec: `yield`).
 * - `period_end` is a date on /markets/query but a `+00:00` timestamp on
 *   summary and trends. Normalised to `YYYY-MM-DD`.
 * - `confidence` arrives capitalised (`High`). Normalised to lower-case.
 *
 * Every metric is nullable, including the summary fields the spec marks
 * non-null. Unknown keys are stripped. All rates are fractions (0.0168).
 */

/** Nullable, tolerant of an absent key: missing and null both become null. */
const metric = z
  .number()
  .nullish()
  .transform((value) => value ?? null)

const text = z
  .string()
  .nullish()
  .transform((value) => value ?? null)

/** `2026-08-31` or `2026-08-31T00:00:00+00:00` → `2026-08-31`. */
export const periodEndSchema = z
  .union([z.iso.date(), z.iso.datetime({ offset: true })])
  .transform((value) => value.slice(0, 10))

export const HTAG_BEDROOMS = ["All", "1", "2", "3", "4", "5"] as const
export const htagBedroomsSchema = z.enum(HTAG_BEDROOMS)
export type HtagBedrooms = z.infer<typeof htagBedroomsSchema>

const bedrooms = htagBedroomsSchema.nullish().transform((value) => value ?? null)

export const HTAG_CONFIDENCE = ["high", "medium", "low"] as const
export type HtagConfidence = (typeof HTAG_CONFIDENCE)[number]

const confidence = z
  .string()
  .transform((value) => value.toLowerCase())
  .pipe(z.enum(HTAG_CONFIDENCE))
  .nullish()
  .transform((value) => value ?? null)

export const HTAG_LEVELS = ["suburb", "lga"] as const
export const htagLevelSchema = z.enum(HTAG_LEVELS)
export type HtagLevel = z.infer<typeof htagLevelSchema>

/** Q13: DOM `0` has been observed where there were no sales. Treat as missing. */
const daysOnMarket = metric.transform((value) => (value === 0 ? null : value))

/** HtAG data guide: vacancy `-1` means "cannot be calculated". */
const vacancyRate = metric.transform((value) => (value === -1 ? null : value))

const series = {
  area_id: z.string().min(1),
  period_end: periodEndSchema,
  property_type: htagPropertyTypeSchema,
}

/** `POST /markets/query` — the 10 allow-listed fields (D42: pass/fail only). */
export const marketQueryRecordSchema = z.object({
  ...series,
  level: htagLevelSchema,
  area_name: text,
  state: text,
  bedrooms,
  typical_price: metric,
  rent: metric,
  confidence,
})

/** `GET /markets/summary`. */
export const marketSummaryRecordSchema = z.object({
  ...series,
  bedrooms,
  typical_price: metric,
  rent: metric,
  gross_yield: metric,
  sales: metric,
  annual_sales_volume: metric,
  rentals: metric,
  annual_rental_volume: metric,
  estimated_dwellings: metric,
  adult_population: metric,
  confidence,
})

export const priceTrendRecordSchema = z.object({
  ...series,
  bedrooms,
  typical_price: metric,
  sales: metric,
})

export const rentTrendRecordSchema = z.object({
  ...series,
  bedrooms,
  median_rent: metric,
  rentals: metric,
})

export const yieldTrendRecordSchema = z.object({
  ...series,
  bedrooms,
  yield_val: metric,
})

export const stockOnMarketTrendRecordSchema = z.object({
  ...series,
  /** `0` is kept: no new listings that period is real data, not a gap. */
  som: metric,
  som_percent: metric,
})

export const daysOnMarketTrendRecordSchema = z.object({
  ...series,
  dom: daysOnMarket,
  discounting: metric,
})

export const vacancyTrendRecordSchema = z.object({
  ...series,
  vacancy_rate: vacancyRate,
})

export const HTAG_TREND_ROW_SCHEMAS = {
  price: priceTrendRecordSchema,
  rent: rentTrendRecordSchema,
  yield: yieldTrendRecordSchema,
  "stock-on-market": stockOnMarketTrendRecordSchema,
  "days-on-market": daysOnMarketTrendRecordSchema,
  vacancy: vacancyTrendRecordSchema,
} as const

export type MarketQueryRow = z.infer<typeof marketQueryRecordSchema>
export type MarketSummaryRow = z.infer<typeof marketSummaryRecordSchema>
export type HtagTrendRow<M extends keyof typeof HTAG_TREND_ROW_SCHEMAS> = z.infer<
  (typeof HTAG_TREND_ROW_SCHEMAS)[M]
>

/** Every list endpoint wraps rows the same way. `total` is the page's row count, never read (D64). */
export const htagEnvelopeSchema = z.object({ results: z.array(z.unknown()) })

/* ---------------------------------------------------------------- errors */

/** 400. FastAPI-style `{ detail }`, plus `errors[]` on validation failures. Not the spec's `{ error, message }`. */
export const badRequestBodySchema = z.object({
  detail: z.string().optional(),
  errors: z.array(z.unknown()).optional(),
})

/** 401: `{ message, hint }`. */
export const unauthorizedBodySchema = z.object({
  message: z.string().optional(),
  hint: z.string().optional(),
})

/** 402: `{ error: "payment_required", message, balance }`. */
export const paymentRequiredBodySchema = z.object({
  error: z.string().optional(),
  message: z.string().optional(),
  balance: z.string().optional(),
})

/* ------------------------------------------------------- query request */

const scalar = z.union([z.string(), z.number(), z.boolean()])

export interface HtagLogicLeaf {
  field: string
  eq?: string | number | boolean
  ne?: string | number | boolean
  gt?: number | string
  gte?: number | string
  lt?: number | string
  lte?: number | string
  in?: Array<string | number>
  nin?: Array<string | number>
  like?: string
  ilike?: string
}

export type HtagLogicNode =
  | { and: HtagLogicNode[] }
  | { or: HtagLogicNode[] }
  | { not: HtagLogicNode }
  | HtagLogicLeaf

const OPERATORS = ["eq", "ne", "gt", "gte", "lt", "lte", "in", "nin", "like", "ilike"] as const

const leafSchema = z
  .strictObject({
    field: z.string().min(1),
    eq: scalar.optional(),
    ne: scalar.optional(),
    gt: z.union([z.number(), z.string()]).optional(),
    gte: z.union([z.number(), z.string()]).optional(),
    lt: z.union([z.number(), z.string()]).optional(),
    lte: z.union([z.number(), z.string()]).optional(),
    in: z
      .array(z.union([z.string(), z.number()]))
      .min(1)
      .optional(),
    nin: z
      .array(z.union([z.string(), z.number()]))
      .min(1)
      .optional(),
    like: z.string().optional(),
    ilike: z.string().optional(),
  })
  .refine((leaf) => OPERATORS.some((op) => leaf[op] !== undefined), {
    message: "A logic leaf needs at least one operator",
  })

/** The `logic` DSL (D42). Validated locally so a malformed tree never reaches a billed endpoint. */
export const htagLogicNodeSchema: z.ZodType<HtagLogicNode> = z.lazy(() =>
  z.union([
    z.strictObject({ and: z.array(htagLogicNodeSchema).min(1) }),
    z.strictObject({ or: z.array(htagLogicNodeSchema).min(1) }),
    z.strictObject({ not: htagLogicNodeSchema }),
    leafSchema,
  ]),
)

/**
 * `POST /markets/query` body, in HtAG's own field names so P1-3's
 * `compileToHtagLogic` output passes straight through. The legacy
 * `price_range` params and `mode` are deliberately absent (D42: logic DSL only).
 */
export const marketQueryInputSchema = z.strictObject({
  level: htagLevelSchema,
  property_types: z.array(htagPropertyTypeSchema).min(1),
  area_ids: z.array(z.string().min(1)).min(1).optional(),
  logic: htagLogicNodeSchema.optional(),
  /** Defaults to the client's `pageSize`. Spec max 10 000. */
  limit: z.int().min(1).max(10_000).optional(),
  offset: z.int().nonnegative().optional(),
})
export type MarketQueryInput = z.input<typeof marketQueryInputSchema>

/* ------------------------------------------------------ GET parameters */

const isoDate = z.iso.date()

const areaParams = {
  level: htagLevelSchema,
  areaIds: z.array(z.string().min(1)).min(1),
  propertyTypes: z.array(htagPropertyTypeSchema).min(1).optional(),
}

export const summaryParamsSchema = z.strictObject({
  ...areaParams,
  bedrooms: htagBedroomsSchema.optional(),
})

export const trendParamsSchema = z.strictObject({
  ...areaParams,
  bedrooms: htagBedroomsSchema.optional(),
  periodEndMin: isoDate.optional(),
  periodEndMax: isoDate.optional(),
})
