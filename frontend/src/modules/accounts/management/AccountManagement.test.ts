import { cleanup, render, screen } from '@testing-library/svelte'
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import type { VaultAccount, VaultData } from '../../../lib/crypto/vault'

// The vault is a plain object mutated in place by the engine, so the store is
// stubbed with a live getter rather than a snapshot.
const store = vi.hoisted(() => ({ vault: null as VaultData | null }))

vi.mock('../../../lib/crypto/vaultStore.svelte', () => ({
  getVaultState: () => ({
    get vault() {
      return store.vault
    },
  }),
  markDirty: vi.fn(),
}))

import AccountManagement from './AccountManagement.svelte'

function account(id: string, name: string): VaultAccount {
  return {
    id,
    name,
    kind: 'transactional',
    currency: 'CHF',
    currentAmount: '100.00',
    lastCorrectedAt: '2026-08-01',
  }
}

function vault(...accounts: VaultAccount[]): VaultData {
  return {
    version: 2,
    budget: { categoryGroups: [], categories: [], periods: [] },
    accounts,
  }
}

beforeEach(() => {
  store.vault = null
})

// Vitest runs without globals, so testing-library's automatic cleanup never
// registers and rendered screens would otherwise stack up in one document.
afterEach(cleanup)

describe('AccountManagement delete affordance', () => {
  // `deleteAccount` throws on the last remaining account — the vault invariant
  // is that at least one always exists. The UI must not offer an action whose
  // only possible outcome is an error.
  test('delete is disabled when only one account remains', () => {
    store.vault = vault(account('a', 'Main'))

    render(AccountManagement, { props: { currentMonth: '2026-08' } })

    const button = screen.getByRole('button', { name: 'Delete Main' })
    expect((button as HTMLButtonElement).disabled).toBe(true)
  })

  test('delete is enabled once a second account exists', () => {
    store.vault = vault(account('a', 'Main'), account('b', 'Reserves'))

    render(AccountManagement, { props: { currentMonth: '2026-08' } })

    expect((screen.getByRole('button', { name: 'Delete Main' }) as HTMLButtonElement).disabled).toBe(
      false,
    )
    expect(
      (screen.getByRole('button', { name: 'Delete Reserves' }) as HTMLButtonElement).disabled,
    ).toBe(false)
  })
})

describe('AccountManagement QR capability', () => {
  // Capability follows from holding an IBAN, not from the account's kind.
  test('the QR bill action appears only for an account with an IBAN', () => {
    const withIban = account('a', 'Main')
    withIban.iban = 'CH9300762011623852957'
    withIban.ibanKind = 'iban'
    store.vault = vault(withIban, account('b', 'Wallet'))

    render(AccountManagement, { props: { currentMonth: '2026-08' } })

    expect(screen.getByRole('button', { name: 'QR bill for Main' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'QR bill for Wallet' })).toBeNull()
  })
})
