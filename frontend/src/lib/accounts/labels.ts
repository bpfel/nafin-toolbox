import type { AccountKind, VaultAccount } from '../crypto/vault'
import { t } from '../i18n/index.svelte'
import type { MessageKey } from '../i18n/locales/en'

/**
 * Which catalogue entry names each account kind.
 *
 * This was a map of English words, and so was a second copy of it inside the
 * account card — both written before the catalogue had these entries, and
 * neither moved when it did. So "Transactional" stayed English on the card and
 * in the routing picker in every language, while the account form beside them
 * said *Zahlungsverkehr* from the catalogue. Now there is one list, and it
 * holds slugs.
 *
 * Written out rather than built from the kind, because they do not match:
 * the kind is `retirement_3a` and the slug is `accountKind.retirement3a`.
 */
const KIND_SLUGS: Record<AccountKind, MessageKey> = {
  transactional: 'accountKind.transactional',
  reserves: 'accountKind.reserves',
  savings: 'accountKind.savings',
  cash: 'accountKind.cash',
  retirement_3a: 'accountKind.retirement3a',
  investment: 'accountKind.investment',
}

/** An account kind, named in the interface language. */
export function accountKindLabel(kind: AccountKind): string {
  return t(KIND_SLUGS[kind])
}

/**
 * Full label for an account: name, kind, and bank when there is one.
 *
 * Two accounts can easily share a name — "Savings" at two banks — so the kind and
 * bank are what make a picker option identifiable. The separator is a middot
 * rather than a dash, which reads better against names that contain dashes.
 */
export function accountLabel(account: VaultAccount): string {
  const parts = [account.name, accountKindLabel(account.kind)]
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
