/**
 * Month arithmetic on HtAG `period_end` dates (`YYYY-MM-DD`). HtAG trend
 * series are monthly and keyed by month end, so points are matched by month
 * (`YYYY-MM`), never by exact day.
 */

export type MonthKey = string

export function monthKey(periodEnd: string): MonthKey {
  return periodEnd.slice(0, 7)
}

function monthIndex(key: MonthKey): number {
  const [year, month] = key.split("-").map(Number)
  if (year === undefined || month === undefined || Number.isNaN(year) || Number.isNaN(month)) {
    throw new RangeError(`Not a month key: ${key}`)
  }
  return year * 12 + (month - 1)
}

function fromIndex(index: number): MonthKey {
  const year = Math.floor(index / 12)
  const month = (index % 12) + 1
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`
}

export function shiftMonths(key: MonthKey, months: number): MonthKey {
  return fromIndex(monthIndex(key) + months)
}

/** Whole months from `a` to `b` (positive when `b` is later). */
export function monthsBetween(a: MonthKey, b: MonthKey): number {
  return monthIndex(b) - monthIndex(a)
}

/**
 * `period_end_min` that returns exactly `points` monthly points ending at the
 * month of `periodEnd`: the first day of the month `points − 1` months back.
 * 37 points ending 2026-08-31 → `2023-08-01` (D68).
 */
export function windowStart(periodEnd: string, points: number): string {
  return `${shiftMonths(monthKey(periodEnd), -(points - 1))}-01`
}

/** The day after a `YYYY-MM-DD` date, for an incremental `period_end_min` (D40). */
export function dayAfter(periodEnd: string): string {
  const date = new Date(`${periodEnd}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + 1)
  return date.toISOString().slice(0, 10)
}
