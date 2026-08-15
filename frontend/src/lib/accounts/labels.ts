import type { AccountKind, VaultAccount } from '../crypto/vault'

/**
 * Human labels for account kinds. Single source of truth — the card, the account
 * form and the allocation controls all name a kind the same way.
 */
export const ACCOUNT_KIND_LABELS: Record<AccountKind, string> = {
  transactional: 'Transactional',
  reserves: 'Reserves',
  savings: 'Savings',
  cash: 'Cash',
  retirement_3a: 'Pillar 3a',
  investment: 'Investment',
}

/**
 * Full label for an account: name, kind, and bank when there is one.
 *
 * Two accounts can easily share a name — "Savings" at two banks — so the kind and
 * bank are what make a picker option identifiable. The separator is a middot
 * rather than a dash, which reads better against names that contain dashes.
 */
export function accountLabel(account: VaultAccount): string {
  const parts = [account.name, ACCOUNT_KIND_LABELS[account.kind]]
  if (account.bankName) parts.push(account.bankName)
  return parts.join(' · ')
}

/**
 * Short label for inline prose, where the full three-part form is too heavy:
 * the name, qualified by the bank only when one is recorded.
 */
export function accountShortLabel(account: VaultAccount): string {
  return account.bankName ? `${account.name} (${account.bankName})` : account.name
}
