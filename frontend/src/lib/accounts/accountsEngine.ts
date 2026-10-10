import type { VaultAccount, VaultData } from '../crypto/vault'
import { isLegalRouting } from './routing'
import { newId, todayISO } from '../sync/source'

// CRUD over the account list, with one rule the rest of the module leans on:
// the vault always holds at least one account. Every other invariant here —
// no unrouted entry, no orphan reassignment target — follows from it.

// Defaults describe the ordinary case: a CHF transactional account, empty,
// anchored today. `opts` overrides any of them, including the generated id.
export function createAccount(
  vault: VaultData,
  opts: Partial<VaultAccount> & { name: string },
): VaultAccount {
  const account: VaultAccount = {
    id: newId('account'),
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

// The descriptive fields: what kind of account it is, and the bank details a
// QR bill needs. They carry no invariant, so this only stores them — clearing
// a field removes the key rather than storing an empty string, keeping the
// vault shape identical to a fresh one.
export type AccountDetailFields = Pick<VaultAccount, 'kind'> &
  Partial<Pick<VaultAccount, 'bankName' | 'iban' | 'ibanKind' | 'holder'>>

export function setAccountDetails(vault: VaultData, id: string, details: AccountDetailFields): void {
  const account = findAccount(vault, id)
  account.kind = details.kind
  if (details.bankName) account.bankName = details.bankName
  else delete account.bankName
  if (details.iban) {
    account.iban = details.iban
    account.ibanKind = details.ibanKind
  } else {
    delete account.iban
    delete account.ibanKind
  }
  if (details.holder) account.holder = { ...details.holder }
  else delete account.holder
}

// Where an entry's money comes from and goes to. Refuses an illegal pair
// rather than storing it: the allocation screen's controls cannot produce one,
// and this is the assertion that keeps that true if they ever change. A reserve
// has to accumulate somewhere, so routing back to spending (no sink) drops it
// rather than leaving it to linger illegally.
export function setRouting(
  vault: VaultData,
  entryId: string,
  sourceAccountId: string | null,
  sinkAccountId: string | null,
): void {
  const entry = vault.budget.entries.find(e => e.id === entryId)
  if (!entry) throw new Error(`entry ${entryId} not found`)
  if (!isLegalRouting(entry.type, sourceAccountId, sinkAccountId)) {
    throw new Error(`a ${entry.type} entry cannot be routed from ${sourceAccountId} to ${sinkAccountId}`)
  }
  entry.sourceAccountId = sourceAccountId
  entry.sinkAccountId = sinkAccountId
  if (sinkAccountId === null) delete entry.reserve
}

function findAccount(vault: VaultData, id: string, role = 'account'): VaultAccount {
  const account = vault.accounts.find(a => a.id === id)
  if (!account) {
    throw new Error(`${role} ${id} not found`)
  }
  return account
}
