import { holdsMoney, savesTowardsTarget, type EntryType, type VaultEntry, type VaultData } from '../crypto/vault'

// An entry's routing is a pair of endpoints: where the money comes from and
// where it goes. `null` on either side means an external counterparty — outside
// every account the user tracks. Because a vault always holds at least one
// account, (null, null) cannot occur.
export type FlowKind = 'income' | 'spending' | 'setaside'

// Read off the type, which since v7 says this outright. It used to be inferred
// from the endpoints — a null source meant income, a null sink meant the money
// was gone — because two entry types could not distinguish spending from
// holding. The endpoints still have to agree, and `isLegalRouting` is what
// enforces that; this no longer has to work it out from them.
export function flowKindOf(entry: VaultEntry): FlowKind {
  if (entry.type === 'income') return 'income'
  return holdsMoney(entry.type) ? 'setaside' : 'spending'
}

// The endpoints must say the same thing the type does.
//
//   income                     arrives from outside      (null, account)
//   expense                    leaves for good           (account, null)
//   savings / bill / purchase  moves but stays yours     (account, account)
//
// The last row includes an account routed to itself: money earmarked inside one
// account has not gone anywhere, it just has a job.
export function isLegalRouting(
  type: EntryType,
  sourceId: string | null,
  sinkId: string | null,
): boolean {
  if (type === 'income') return sourceId === null && sinkId !== null
  if (holdsMoney(type)) return sourceId !== null && sinkId !== null
  return sourceId !== null && sinkId === null
}

// The routing an entry is born with, so it is never created unrouted or
// contradictory. Only the sink is a real choice, and only for the three types
// that hold money — the account it lands in can be changed afterwards, and
// defaults to the one it came from: money set aside inside your main account
// is the ordinary case, not a special one.
export function defaultRouting(
  type: EntryType,
  primaryAccountId: string,
): { sourceAccountId: string | null; sinkAccountId: string | null } {
  if (type === 'income') {
    return { sourceAccountId: null, sinkAccountId: primaryAccountId }
  }
  if (holdsMoney(type)) {
    return { sourceAccountId: primaryAccountId, sinkAccountId: primaryAccountId }
  }
  return { sourceAccountId: primaryAccountId, sinkAccountId: null }
}

// The account new entries default to. The vault invariant guarantees at
// least one account exists; an empty array is a broken vault, not a valid state.
export function primaryAccountId(vault: VaultData): string {
  const first = vault.accounts[0]
  if (!first) {
    throw new Error('vault has no accounts: the vault invariant requires at least one')
  }
  return first.id
}

// A reserve is a target to reach, so it belongs only to the two types that save
// towards one. Savings has no target; income and expense hold nothing.
export function isLegalEntryRouting(entry: VaultEntry): boolean {
  if (!isLegalRouting(entry.type, entry.sourceAccountId, entry.sinkAccountId)) {
    return false
  }
  if (entry.reserve === undefined) return true
  return savesTowardsTarget(entry.type)
}
