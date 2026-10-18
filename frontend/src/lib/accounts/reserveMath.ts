import type { ReserveDefinition } from '../crypto/vault'
import { addMonths, monthsBetween } from '../util/calendar'
import { fromCents, toCents } from '../util/money'

// Reserve math. Everything here is pure: a reserve definition plus the month you
// are asking about yields the amount that should already have accumulated.
//
// Money is a decimal string on the outside and integer cents on the inside.
// `targetAmount / periodMonths` in floating point drifts — 1000.00 over 12 is
// 83.3333... and twelve of those do not add back up to 1000.00. Dividing the
// *cumulative* figure instead (k x target / periodMonths, rounded once) makes
// every month exact against the target and the final month land on it precisely.


// --- Money ------------------------------------------------------------------

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
//   Bill         — the anchor is a *due* month, recurring forever in both
//                  directions. k counts months into the cycle that ends at the
//                  next due month, carrying the lead, so k = periodMonths both
//                  in the due month and the month before it, and k = 2 — not
//                  zero — the month after it rolls. See `BILL_LEAD_MONTHS`.
//
//   Purchase     — the anchor is the *start* of the current cycle, i.e. the
//                  month of the last purchase. k counts months elapsed since
//                  then, so k = 0 in the purchase month and nothing is owed.
//                  Past the full period the requirement stays at the target
//                  instead of rolling over: only the purchase dialogue resets
//                  an amortization, because only the user knows they bought it.
/**
 * How far ahead of the due month an obligation must be fully funded.
 *
 * A bill that falls due in March is often paid in February, and having the money
 * appear only in the month it leaves is too late to be useful.
 *
 * The lead shifts the schedule; it does not steepen it. A yearly bill is twelve
 * monthly payments of target/12 — the division a person expects, and the one
 * they can check — arranged so the reserve is full the month *before* the bill
 * lands rather than the month it does. Saving the same target over eleven months
 * instead would get there too, at target/11, but it makes the monthly figure an
 * answer to a question nobody asked.
 *
 * What pays for the early arrival is a permanent float of one month's payment.
 * Paying the bill does not empty the reserve: the contribution made in the due
 * month stays behind, and eleven more on top of it reach the target again a
 * month early. So the requirement troughs at two months' worth just after the
 * bill is paid, never at zero. That float is real money standing still, and it
 * is the whole cost of the arrangement.
 */
const BILL_LEAD_MONTHS = 1

/**
 * One month of this reserve — what to pay in, rather than what it all comes to.
 *
 * Both kinds divide by the whole period, because the lead moves *when* the ramp
 * runs rather than how steep it is. It is the figure a standing order would
 * carry, which is why the QR bill fills with it.
 */
export function monthlyForItem(
  type: 'bill' | 'purchase',
  reserve: ReserveDefinition,
): string {
  assertPeriod(reserve.periodMonths)
  return fromCents(
    roundHalfAwayFromZero(toCents(reserve.targetAmount) / reserve.periodMonths),
  )
}

/**
 * How much of the target should already be aside this month.
 *
 * Takes the entry's type rather than reading a `kind` off the reserve: since v7
 * the type *is* the schedule, and the two were previously recorded separately
 * for no reason other than that an entry could only be income or expense.
 */
export function requiredForItem(
  type: 'bill' | 'purchase',
  reserve: ReserveDefinition,
  currentMonth: string,
): string {
  const { targetAmount, periodMonths, anchorMonth } = reserve
  assertPeriod(periodMonths)

  const target = toCents(targetAmount)

  if (type === 'purchase') {
    // No lead: nothing arrives on a date. The purchase happens when the money is
    // there, so being ready "early" is not a distinct state.
    const elapsed = clamp(monthsBetween(anchorMonth, currentMonth), 0, periodMonths)
    return fromCents(roundHalfAwayFromZero((target * elapsed) / periodMonths))
  }

  // A bill. The ramp runs at target/period like everything else, shifted forward
  // by the lead so it tops out the month before the bill falls due and holds
  // there through the due month itself — the money has to still be sitting there
  // when the bill is actually paid.
  //
  // The clamp at the top is what creates the float: `elapsed` would reach
  // period + lead, and capping it at period leaves the reserve holding one
  // month's payment the moment the bill clears.
  const monthsUntilDue = monthsBetween(currentMonth, nextDue(anchorMonth, periodMonths, currentMonth))
  const elapsed = clamp(periodMonths + BILL_LEAD_MONTHS - monthsUntilDue, 0, periodMonths)

  return fromCents(roundHalfAwayFromZero((target * elapsed) / periodMonths))
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high)
}
