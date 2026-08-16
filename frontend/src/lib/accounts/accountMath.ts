import type { VaultAccount, VaultCategory, VaultData } from '../crypto/vault'
import { flowKindOf } from './routing'
import { fromCents, monthsBetween, requiredForItem, toCents } from './reserveMath'

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

// A shortfall is a property of the account, not of any one item, so individual
// obligations and amortizations are never tracked separately against a balance —
// they sum into a single figure for whichever account they sink into.
//
// Archived categories are excluded: archiving a reserve is how the user says the
// obligation is gone, and it must lower the account's required amount.
export function requiredForAccount(
  vault: VaultData,
  accountId: string,
  currentMonth: string,
): string {
  findAccount(vault, accountId)

  let cents = 0
  for (const category of vault.budget.categories) {
    if (category.archived) continue
    if (!category.reserve) continue
    if (category.sinkAccountId !== accountId) continue
    cents += toCents(requiredForItem(category.reserve, currentMonth))
  }
  return fromCents(cents)
}

// --- Projection -------------------------------------------------------------

// What one month of the plan does to one account's balance. A category that
// both sources from and sinks into this account moves nothing, which falls out
// of adding the sink side and subtracting the source side.
function netAllocationCents(
  categoriesById: Map<string, VaultCategory>,
  entries: readonly { categoryId: string; plannedAmount: string }[],
  accountId: string,
): number {
  let cents = 0
  for (const entry of entries) {
    const category = categoriesById.get(entry.categoryId)
    // An entry whose category is gone belongs to no account.
    if (!category) continue
    // Guard before classifying: an untouched account is unaffected either way,
    // and a category with no endpoints at all is nobody's flow.
    if (category.sourceAccountId !== accountId && category.sinkAccountId !== accountId) continue

    const planned = toCents(entry.plannedAmount)
    switch (flowKindOf(category)) {
      // Money arrives from outside; the guard makes this account the sink.
      case 'income':
        cents += planned
        break
      // Money leaves for good; the guard makes this account the source.
      case 'spending':
        cents -= planned
        break
      // Money moves between accounts, possibly both of them this one.
      case 'setaside':
        if (category.sinkAccountId === accountId) cents += planned
        if (category.sourceAccountId === accountId) cents -= planned
        break
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

  const categoriesById = new Map(vault.budget.categories.map(c => [c.id, c]))
  // The plan does not vary by month, so the flow is computed once and scaled.
  const netMonthlyFlow = netAllocationCents(categoriesById, vault.budget.plan, accountId)
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
