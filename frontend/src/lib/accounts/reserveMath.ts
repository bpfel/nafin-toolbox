import type { ReserveDefinition } from '../crypto/vault'

// Reserve math. Everything here is pure: a reserve definition plus the month you
// are asking about yields the amount that should already have accumulated.
//
// Money is a decimal string on the outside and integer cents on the inside.
// `targetAmount / periodMonths` in floating point drifts — 1000.00 over 12 is
// 83.3333... and twelve of those do not add back up to 1000.00. Dividing the
// *cumulative* figure instead (k x target / periodMonths, rounded once) makes
// every month exact against the target and the final month land on it precisely.

const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/
const MONEY_PATTERN = /^\s*(-?)(\d+)(?:\.(\d+))?\s*$/

// --- Month arithmetic -------------------------------------------------------

// Months since the epoch year 0, so month strings compare and subtract as plain
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
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`
}

// Signed distance in months. Negative when `toMonth` precedes `fromMonth`.
export function monthsBetween(fromMonth: string, toMonth: string): number {
  return monthIndex(toMonth) - monthIndex(fromMonth)
}

// Add a signed number of months to a 'YYYY-MM'.
export function addMonths(month: string, offset: number): string {
  return formatMonth(monthIndex(month) + offset)
}

// --- Money ------------------------------------------------------------------

// Exported so every accounts figure goes through one parser: money crosses the
// module boundary as a decimal string and is integer cents everywhere inside.
export function toCents(amount: string): number {
  const match = MONEY_PATTERN.exec(amount)
  if (!match) {
    throw new Error(`invalid amount '${amount}': expected a decimal string`)
  }
  const [, sign, whole, fraction = ''] = match
  const padded = `${fraction}000`
  const cents = Number(whole) * 100 + Number(padded.slice(0, 2))
  // A third decimal (or more) rounds half away from zero, matching the display
  // rounding a user would expect rather than truncating their money away.
  const rounded = Number(padded[2]) >= 5 ? cents + 1 : cents
  return sign === '-' ? -rounded : rounded
}

export function fromCents(cents: number): string {
  const sign = cents < 0 ? '-' : ''
  const absolute = Math.abs(cents)
  return `${sign}${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, '0')}`
}

function roundHalfAwayFromZero(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value)
}

// --- Reserves ---------------------------------------------------------------

function assertPeriod(periodMonths: number): void {
  if (!Number.isInteger(periodMonths) || periodMonths < 1) {
    throw new Error(`invalid periodMonths '${periodMonths}': expected a positive integer`)
  }
}

// The first occurrence of the anchor's recurrence that is not in the past.
// The recurrence extends in both directions, so an anchor may sit before or
// after `currentMonth` and still describe the same series of due months.
export function nextDue(anchorMonth: string, periodMonths: number, currentMonth: string): string {
  assertPeriod(periodMonths)
  const offset = monthsBetween(anchorMonth, currentMonth)
  // Smallest n with anchor + n * periodMonths >= current.
  const cycles = Math.ceil(offset / periodMonths)
  return addMonths(anchorMonth, cycles * periodMonths)
}

// How much of `targetAmount` should already be set aside by `currentMonth`.
//
// The two kinds differ in what `anchorMonth` means, and therefore in how the
// cycle rolls — the shared formula in the design doc is off by one month for
// amortizations, which would demand the full target in the month of purchase.
//
//   Obligation   — the anchor is a *due* month, recurring forever in both
//                  directions. k counts months into the cycle that ends at the
//                  next due month, so k = periodMonths when the bill is due now
//                  and k = 1 the month after it rolls.
//
//   Amortization — the anchor is the *start* of the current cycle, i.e. the
//                  month of the last purchase. k counts months elapsed since
//                  then, so k = 0 in the purchase month and nothing is owed.
//                  Past the full period the requirement stays at the target
//                  instead of rolling over: only the purchase dialogue resets
//                  an amortization, because only the user knows they bought it.
/**
 * How far ahead of the due month an obligation must be fully funded.
 *
 * A bill that falls due in March is often paid in February, and having the money
 * appear only in the month it leaves is too late to be useful. With a lead of 1
 * the full target is required a month early, which means the same amount is
 * saved over one fewer month — the monthly rate rises from target/period to
 * target/(period - 1) rather than the schedule simply shifting and leaving a
 * permanent shortfall.
 */
const OBLIGATION_LEAD_MONTHS = 1

export function requiredForItem(reserve: ReserveDefinition, currentMonth: string): string {
  const { kind, targetAmount, periodMonths, anchorMonth } = reserve
  assertPeriod(periodMonths)

  const target = toCents(targetAmount)

  if (kind === 'amortization') {
    // No lead: nothing arrives on a date. The purchase happens when the money is
    // there, so being ready "early" is not a distinct state.
    const elapsed = clamp(monthsBetween(anchorMonth, currentMonth), 0, periodMonths)
    return fromCents(roundHalfAwayFromZero((target * elapsed) / periodMonths))
  }

  // Obligation. The saving window is the cycle minus the lead, so the full target
  // lands `OBLIGATION_LEAD_MONTHS` before the bill. A period short enough that the
  // lead would consume it entirely (a monthly bill) keeps a one-month window
  // rather than dividing by zero.
  const savingMonths = Math.max(1, periodMonths - OBLIGATION_LEAD_MONTHS)
  const monthsUntilDue = monthsBetween(currentMonth, nextDue(anchorMonth, periodMonths, currentMonth))
  const elapsed = clamp(periodMonths - monthsUntilDue, 0, savingMonths)

  return fromCents(roundHalfAwayFromZero((target * elapsed) / savingMonths))
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high)
}
