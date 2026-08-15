import type { VaultCategory, VaultData } from '../crypto/vault'

// A category's routing is a pair of endpoints: where the money comes from and
// where it goes. `null` on either side means an external counterparty — outside
// every account the user tracks. Because a vault always holds at least one
// account, (null, null) cannot occur.
export type FlowKind = 'income' | 'spending' | 'setaside'

// Classify a routed category by the shape of its endpoints:
//   (null, A) income    — money arrives from outside
//   (A, null) spending  — money leaves your accounts for good
//   (A, B) / (A, A) setaside — money moves but stays yours
export function flowKindOf(category: VaultCategory): FlowKind {
  const { sourceAccountId, sinkAccountId } = category
  if (sourceAccountId === null && sinkAccountId === null) {
    throw new Error(
      `category ${category.id} has no endpoints: at least one of source or sink must be an account`,
    )
  }
  if (sourceAccountId === null) return 'income'
  if (sinkAccountId === null) return 'spending'
  return 'setaside'
}

// `type` must agree with the direction of boundary crossing, when there is one.
// A null source means income; a null sink means expense; two internal endpoints
// can only be an expense.
export function isLegalRouting(
  type: 'income' | 'expense',
  sourceId: string | null,
  sinkId: string | null,
): boolean {
  // Cannot occur under the always-one-account invariant; rejected rather than classified.
  if (sourceId === null && sinkId === null) return false
  if (sourceId === null) return type === 'income'
  return type === 'expense'
}

// The routing a category is born with. Both rows are legal, so a category is
// never created unrouted or contradictory. These are defaults, not the only
// available shapes — an expense may be re-routed into a set-aside later.
export function defaultRouting(
  type: 'income' | 'expense',
  primaryAccountId: string,
): { sourceAccountId: string | null; sinkAccountId: string | null } {
  if (type === 'income') {
    return { sourceAccountId: null, sinkAccountId: primaryAccountId }
  }
  return { sourceAccountId: primaryAccountId, sinkAccountId: null }
}

// The account new categories default to. The vault invariant guarantees at
// least one account exists; an empty array is a broken vault, not a valid state.
export function primaryAccountId(vault: VaultData): string {
  const first = vault.accounts[0]
  if (!first) {
    throw new Error('vault has no accounts: the vault invariant requires at least one')
  }
  return first.id
}

// A reserve accumulates somewhere, so it is only meaningful on a set-aside:
// `reserve` implies `type === 'expense'` and `sink !== null`.
export function isLegalCategoryRouting(category: VaultCategory): boolean {
  if (!isLegalRouting(category.type, category.sourceAccountId, category.sinkAccountId)) {
    return false
  }
  if (category.reserve === undefined) return true
  return category.type === 'expense' && category.sinkAccountId !== null
}
