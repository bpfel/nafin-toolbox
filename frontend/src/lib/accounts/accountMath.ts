import {
  holdsMoney,
  savesTowardsTarget,
  type VaultAccount,
  type VaultEntry,
  type VaultData,
} from '../crypto/vault'
import { fromCents, monthlyForItem, monthsBetween, nextDue, requiredForItem, toCents } from './reserveMath'

// Per-account figures, derived on every read. Nothing here writes to the vault:
// the account holds an anchor pair (`currentAmount` as at `lastCorrectedAt`) and
// the working balance is recomputed from it, so opening the app twice in a month
// cannot post twice and there is no running total to drift.

function findAccount(vault: VaultData, accountId: string): VaultAccount {
  const account = vault.accounts.find(a => a.id === accountId)
  if (!account) {
    throw new Error(`unknown account '${accountId}'`)
  }
  return account
}

// --- Required ---------------------------------------------------------------

/** One line of what an account's required amount is made of. */
export interface AllocationPart {
  entryId: string
  entryName: string
  /** The budget heading the entry sits under, for context in a long list. */
  categoryName: string
  type: 'bill' | 'purchase'
  /** What should already be aside this month. These sum to the account total. */
  required: string
  /** The whole figure being saved towards, so a part reads as progress. */
  targetAmount: string
  /**
   * One month of it — what a standing order or a QR bill would carry.
   *
   * Kept beside the target rather than left to the caller to divide: the months
   * to divide by are not `periodMonths` for a bill, which funds itself a month
   * early, and a caller working that out for itself is a caller that will get
   * it wrong. See `monthlyForItem`.
   */
  monthlyAmount: string
  /**
   * The month the bill falls due. Null for a purchase, which has no date: its
   * anchor is the start of the cycle, not a deadline, and past the full period
   * the requirement simply stays at the target until the user buys the thing.
   */
  nextDueMonth: string | null
}

// What the account's required amount is made of, biggest part first.
//
// This is the definition; `requiredForAccount` is its sum. Written the other way
// round the two could disagree — a filter tightened in one and not the other —
// and a total that does not match the list under it is worse than no list.
//
// Archived entries are excluded: archiving a reserve is how the user says the
// bill is gone, and it must lower the account's required amount.
export function allocationBreakdown(
  vault: VaultData,
  accountId: string,
  currentMonth: string,
): AllocationPart[] {
  findAccount(vault, accountId)

  const categoryNames = new Map(vault.budget.categories.map(c => [c.id, c.name]))

  const parts: AllocationPart[] = []
  for (const entry of vault.budget.entries) {
    if (entry.archived) continue
    if (!entry.reserve) continue
    if (!savesTowardsTarget(entry.type)) continue
    if (entry.sinkAccountId !== accountId) continue

    parts.push({
      entryId: entry.id,
      entryName: entry.name,
      categoryName: categoryNames.get(entry.categoryId) ?? '',
      type: entry.type,
      required: requiredForItem(entry.type, entry.reserve, currentMonth),
      targetAmount: entry.reserve.targetAmount,
      monthlyAmount: monthlyForItem(entry.type, entry.reserve),
      nextDueMonth:
        entry.type === 'bill'
          ? nextDue(entry.reserve.anchorMonth, entry.reserve.periodMonths, currentMonth)
          : null,
    })
  }

  // Biggest first: the question the list answers is "what is most of this?".
  // Name breaks ties so the order is stable rather than however the entries
  // happen to sit in the vault.
  return parts.sort(
    (a, b) =>
      toCents(b.required) - toCents(a.required) || a.entryName.localeCompare(b.entryName),
  )
}

// A shortfall is a property of the account, not of any one item, so individual
// bills and purchases are never tracked separately against a balance — they sum
// into a single figure for whichever account they sink into.
export function requiredForAccount(
  vault: VaultData,
  accountId: string,
  currentMonth: string,
): string {
  let cents = 0
  for (const part of allocationBreakdown(vault, accountId, currentMonth)) {
    cents += toCents(part.required)
  }
  return fromCents(cents)
}

// --- Projection -------------------------------------------------------------

// What one month of the plan does to one account's balance. An entry that
// both sources from and sinks into this account moves nothing, which falls out
// of adding the sink side and subtracting the source side.
function netAllocationCents(
  entriesById: Map<string, VaultEntry>,
  planLines: readonly { entryId: string; plannedAmount: string }[],
  accountId: string,
): number {
  let cents = 0
  for (const line of planLines) {
    const entry = entriesById.get(line.entryId)
    // A plan line whose entry is gone belongs to no account.
    if (!entry) continue
    // Guard before classifying: an untouched account is unaffected either way,
    // and an entry with no endpoints at all is nobody's flow.
    if (entry.sourceAccountId !== accountId && entry.sinkAccountId !== accountId) continue

    const planned = toCents(line.plannedAmount)

    // Straight off the type. It used to go through a classifier that read the
    // endpoints and answered in a vocabulary of its own — income, spending,
    // set-aside — which existed only because two entry types could not tell
    // spending from holding. Three words for what the type already says.
    if (entry.type === 'income') {
      // Arrives from outside; the guard above makes this account the sink.
      cents += planned
    } else if (!holdsMoney(entry.type)) {
      // Leaves for good; the guard makes this account the source.
      cents -= planned
    } else {
      // Moves between accounts, possibly both of them this one.
      if (entry.sinkAccountId === accountId) cents += planned
      if (entry.sourceAccountId === accountId) cents -= planned
    }
  }
  return cents
}

// The anchor plus one month of the plan for every month elapsed since it.
//
// Months are compared at month granularity: `lastCorrectedAt` is a date, and the
// correction is taken to account for the whole month it falls in, so that month
// contributes nothing and only months strictly after it — up to and including
// `currentMonth` — are added. A `currentMonth` before the anchor adds nothing
// rather than subtracting: the projection runs forward from a correction, it
// does not reconstruct the past.
//
// This also fixes a quiet bug in the previous, period-based definition. It summed
// the periods that fell in the window, so a month with no period row contributed
// zero and any gap in the periods silently understated the projection. The plan
// is a standing monthly flow, so every elapsed month now counts the same amount.
//
// Pure and idempotent by construction: it reads the vault and returns a string.
export function projectedBalance(
  vault: VaultData,
  accountId: string,
  currentMonth: string,
): string {
  const account = findAccount(vault, accountId)
  const anchorMonth = account.lastCorrectedAt.slice(0, 7)

  const entriesById = new Map(vault.budget.entries.map(c => [c.id, c]))
  // The plan does not vary by month, so the flow is computed once and scaled.
  const netMonthlyFlow = netAllocationCents(entriesById, vault.budget.plan, accountId)
  const monthsElapsed = Math.max(0, monthsBetween(anchorMonth, currentMonth))

  return fromCents(toCents(account.currentAmount) + monthsElapsed * netMonthlyFlow)
}

// --- Available --------------------------------------------------------------

// What may actually be spent from this account: the projected balance less
// everything already spoken for. Goes negative when the account is under-funded,
// and that negative figure is the shortfall.
export function availableForAccount(
  vault: VaultData,
  accountId: string,
  currentMonth: string,
): string {
  const projected = toCents(projectedBalance(vault, accountId, currentMonth))
  const required = toCents(requiredForAccount(vault, accountId, currentMonth))
  return fromCents(projected - required)
}
