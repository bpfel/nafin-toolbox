/**
 * Months and days as the app stores them: `'YYYY-MM'` and `'YYYY-MM-DD'`.
 *
 * One copy of each, because there used to be a dozen — "this month" alone was
 * written out seven times — and they did not agree. Three of the "today"s read
 * the date in UTC, so between midnight and two in the morning in Zürich an
 * account corrected at 00:30 was dated yesterday while a receipt entered beside
 * it was dated today.
 *
 * Always the local calendar: a receipt's day, a correction's day and the month a
 * budget closes are the ones on the wall, not the ones in Greenwich. Pure; for
 * month *names* see `months.ts`.
 */

const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/

const pad = (n: number) => String(n).padStart(2, '0')

/** This month, `'YYYY-MM'`. */
export function thisMonth(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}`
}

/** Today, `'YYYY-MM-DD'`. */
export function today(now: Date = new Date()): string {
  return `${thisMonth(now)}-${pad(now.getDate())}`
}

// Months since the year 0, so month strings compare and subtract as plain
// integers. Only differences are ever meaningful, never the absolute value.
function monthIndex(month: string): number {
  const match = MONTH_PATTERN.exec(month)
  if (!match) {
    throw new Error(`invalid month '${month}': expected 'YYYY-MM'`)
  }
  return Number(match[1]) * 12 + (Number(match[2]) - 1)
}

function formatMonth(index: number): string {
  const year = Math.floor(index / 12)
  const month = index - year * 12 + 1
  return `${String(year).padStart(4, '0')}-${pad(month)}`
}

/** Signed distance in months. Negative when `toMonth` precedes `fromMonth`. */
export function monthsBetween(fromMonth: string, toMonth: string): number {
  return monthIndex(toMonth) - monthIndex(fromMonth)
}

/** Add a signed number of months to a `'YYYY-MM'`. */
export function addMonths(month: string, offset: number): string {
  return formatMonth(monthIndex(month) + offset)
}

/** The month after `month`. */
export function nextMonth(month: string): string {
  return addMonths(month, 1)
}

// --- as people read them ------------------------------------------------------
//
// Always dd.mm.yyyy, whatever language the interface is in: it is how a date is
// written in Switzerland in all four languages, as a franc amount is 1’234.50
// in all of them. Four screens used to format dates four ways, and one followed
// the browser's language rather than the app's.

const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * `'2026-10-03'` or a timestamp → `03.10.2026`. A plain day is read as written,
 * not as midnight UTC, which west of Greenwich is the day before. Anything that
 * is not a date comes back unchanged, so a corrupt value shows as itself.
 */
export function formatDate(value: string): string {
  const day = DAY_PATTERN.exec(value)
  if (day) return `${day[3]}.${day[2]}.${day[1]}`
  const d = new Date(value)
  if (isNaN(d.getTime())) return value
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`
}

/** A timestamp → `03.10.2026, 14:05`, or with `seconds`, `14:05:09`. Local time. */
export function formatDateTime(value: string, options: { seconds?: boolean } = {}): string {
  const d = new Date(value)
  if (isNaN(d.getTime())) return value
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}${options.seconds ? `:${pad(d.getSeconds())}` : ''}`
  return `${formatDate(value)}, ${time}`
}
