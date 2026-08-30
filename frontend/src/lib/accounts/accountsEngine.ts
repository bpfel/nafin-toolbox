import type { VaultAccount, VaultData } from '../crypto/vault'

// CRUD over the account list, with one rule the rest of the module leans on:
// the vault always holds at least one account. Every other invariant here —
// no unrouted entry, no orphan reassignment target — follows from it.

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

// Defaults describe the ordinary case: a CHF transactional account, empty,
// anchored today. `opts` overrides any of them, including the generated id.
export function createAccount(
  vault: VaultData,
  opts: Partial<VaultAccount> & { name: string },
): VaultAccount {
  const account: VaultAccount = {
    id: crypto.randomUUID(),
    kind: 'transactional',
    currency: 'CHF',
    currentAmount: '0.00',
    lastCorrectedAt: todayISO(),
    ...opts,
  }
  vault.accounts.push(account)
  return account
}

export function renameAccount(vault: VaultData, id: string, name: string): void {
  const account = findAccount(vault, id)
  account.name = name
}

// Deleting an account moves every entry that referenced it onto
// `reassignToId`. Reassignment only ever substitutes one id for another; it
// never turns an endpoint null or non-null, and legality is decided purely by
// which endpoints are null. So a legal routing stays legal — including
// (deleted, reassignTo) collapsing to (reassignTo, reassignTo), which is the
// set-aside-within-one-account case and legal by design.
export function deleteAccount(vault: VaultData, id: string, reassignToId: string): void {
  findAccount(vault, id)

  // The core invariant: there is never zero accounts.
  if (vault.accounts.length === 1) {
    throw new Error(
      `cannot delete account ${id}: it is the last remaining account and a vault must always hold at least one`,
    )
  }

  if (reassignToId === id) {
    throw new Error(`cannot reassign the entries of account ${id} to the account being deleted`)
  }
  findAccount(vault, reassignToId, 'reassignment target')

  for (const entry of vault.budget.entries) {
    if (entry.sourceAccountId === id) entry.sourceAccountId = reassignToId
    if (entry.sinkAccountId === id) entry.sinkAccountId = reassignToId
  }

  vault.accounts = vault.accounts.filter(a => a.id !== id)
}

// `vault.accounts` has no sortOrder field: the array order *is* the display
// order, so reordering means rearranging the array itself.
//
// `accountIds` is treated as a preference, not as the truth about what exists.
// It comes from reading the DOM back out after a drag, so it can be stale,
// partial, or carry an id for an account that is already gone. Anything it
// leaves out is kept and appended in its previous relative order, and ids that
// match no account are skipped — losing an account here would destroy user data,
// which no reordering gesture should ever be able to do.
export function reorderAccounts(vault: VaultData, accountIds: string[]): void {
  const unplaced = new Map(vault.accounts.map(a => [a.id, a]))
  const ordered: VaultAccount[] = []

  for (const id of accountIds) {
    const account = unplaced.get(id)
    // Skips both unknown ids and a repeated id already placed.
    if (!account) continue
    unplaced.delete(id)
    ordered.push(account)
  }

  // A Map iterates in insertion order, so the leftovers come out in the order
  // they had in the vault.
  vault.accounts = [...ordered, ...unplaced.values()]
}

// The anchor pair. `currentAmount` is only meaningful as at `lastCorrectedAt`,
// so the two always move together — this is the sole way `currentAmount`
// changes. Allocations never touch it; the working balance is projected from
// this pair instead.
export function correctBalance(vault: VaultData, id: string, amount: string, atDate: string): void {
  const account = findAccount(vault, id)
  account.currentAmount = amount
  account.lastCorrectedAt = atDate
}

function findAccount(vault: VaultData, id: string, role = 'account'): VaultAccount {
  const account = vault.accounts.find(a => a.id === id)
  if (!account) {
    throw new Error(`${role} ${id} not found`)
  }
  return account
}
