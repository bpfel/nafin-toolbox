import { cleanup, render, screen } from '@testing-library/svelte'
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { tick } from 'svelte'
import Sortable from 'sortablejs'
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

import { clearEditing, toggleEditing } from '../../../lib/util/editMode.svelte'
import AccountManagement from './AccountManagement.svelte'

/** Puts the accounts module into edit mode for the rest of the test. */
function editMode() {
  toggleEditing('accounts')
}

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
    version: 4,
    budget: { categoryGroups: [], categories: [], plan: [], archives: [] },
    accounts,
  }
}

beforeEach(() => {
  store.vault = null
  // Edit mode is module state shared by every test in the file, so each one
  // starts read-only — the default the module actually ships with.
  clearEditing()
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
    editMode()

    render(AccountManagement, { props: { currentMonth: '2026-08' } })

    const button = screen.getByRole('button', { name: 'Delete Main' })
    expect((button as HTMLButtonElement).disabled).toBe(true)
  })

  test('delete is enabled once a second account exists', () => {
    store.vault = vault(account('a', 'Main'), account('b', 'Reserves'))
    editMode()

    render(AccountManagement, { props: { currentMonth: '2026-08' } })

    expect((screen.getByRole('button', { name: 'Delete Main' }) as HTMLButtonElement).disabled).toBe(
      false,
    )
    expect(
      (screen.getByRole('button', { name: 'Delete Reserves' }) as HTMLButtonElement).disabled,
    ).toBe(false)
  })
})

describe('AccountManagement reorder affordance', () => {
  // `vault.accounts` has no sortOrder — the array order is the display order,
  // and `onEnd` reads it back out of these attributes.
  test('every card carries its account id for the drop handler to read', () => {
    store.vault = vault(account('a', 'Main'), account('b', 'Reserves'))

    const { container } = render(AccountManagement, { props: { currentMonth: '2026-08' } })

    const ids = Array.from(container.querySelectorAll('.account-card')).map(
      c => (c as HTMLElement).dataset.accountId,
    )
    expect(ids).toEqual(['a', 'b'])
  })

  test('cards render in vault.accounts order', () => {
    store.vault = vault(account('b', 'Reserves'), account('a', 'Main'))

    const { container } = render(AccountManagement, { props: { currentMonth: '2026-08' } })

    const ids = Array.from(container.querySelectorAll('.account-card')).map(
      c => (c as HTMLElement).dataset.accountId,
    )
    expect(ids).toEqual(['b', 'a'])
  })

  test('each card exposes a labelled drag handle in edit mode', () => {
    store.vault = vault(account('a', 'Main'), account('b', 'Reserves'))
    editMode()

    render(AccountManagement, { props: { currentMonth: '2026-08' } })

    expect(screen.getByLabelText('Drag to reorder Main').classList.contains('drag-handle')).toBe(
      true,
    )
    expect(screen.getByLabelText('Drag to reorder Reserves')).toBeTruthy()
  })

  // Dragging the only account can only put it back where it was.
  test('no drag handle is offered when a single account exists', () => {
    store.vault = vault(account('a', 'Main'))
    editMode()

    const { container } = render(AccountManagement, { props: { currentMonth: '2026-08' } })

    expect(container.querySelectorAll('.drag-handle')).toHaveLength(0)
  })
})

describe('AccountManagement edit mode', () => {
  // The module is read-only by default: you can read your figures and keep them
  // truthful, but you cannot restructure anything until you ask to.
  test('the structural affordances are absent by default', () => {
    store.vault = vault(account('a', 'Main'), account('b', 'Reserves'))

    const { container } = render(AccountManagement, { props: { currentMonth: '2026-08' } })

    expect(container.querySelectorAll('.drag-handle')).toHaveLength(0)
    expect(screen.queryByRole('button', { name: '+ Add account' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Edit Main' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Delete Main' })).toBeNull()
  })

  test('edit mode reveals every one of them', () => {
    store.vault = vault(account('a', 'Main'), account('b', 'Reserves'))
    editMode()

    const { container } = render(AccountManagement, { props: { currentMonth: '2026-08' } })

    expect(container.querySelectorAll('.drag-handle')).toHaveLength(2)
    expect(screen.getByRole('button', { name: '+ Add account' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Edit Main' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Delete Main' })).toBeTruthy()
  })

  // The one exception worth pinning down. Correcting the balance is how the
  // projection stays honest; burying it behind a mode would let the anchor go
  // stale, which is the exact failure the anchor pair exists to prevent.
  test('correcting a balance is available in both modes', () => {
    store.vault = vault(account('a', 'Main'))

    render(AccountManagement, { props: { currentMonth: '2026-08' } })
    expect(screen.getAllByRole('button', { name: 'Correct balance' })).toHaveLength(1)

    cleanup()
    editMode()

    render(AccountManagement, { props: { currentMonth: '2026-08' } })
    expect(screen.getAllByRole('button', { name: 'Correct balance' })).toHaveLength(1)
  })

  test('toggling edit mode after render takes effect without a remount', async () => {
    store.vault = vault(account('a', 'Main'), account('b', 'Reserves'))

    const { container } = render(AccountManagement, { props: { currentMonth: '2026-08' } })
    expect(container.querySelectorAll('.drag-handle')).toHaveLength(0)

    editMode()
    await tick()

    expect(container.querySelectorAll('.drag-handle')).toHaveLength(2)
  })

  // Hiding the handle removes the affordance; only the instance option stops a
  // drag from being started at all.
  test('the sortable instance is disabled until edit mode, and re-enabled with it', async () => {
    store.vault = vault(account('a', 'Main'), account('b', 'Reserves'))

    const { container } = render(AccountManagement, { props: { currentMonth: '2026-08' } })
    const instance = Sortable.get(container.querySelector('.cards') as HTMLElement)!
    expect(instance.option('disabled')).toBe(true)

    editMode()
    await tick()
    expect(instance.option('disabled')).toBe(false)

    // …and locks again on the way out.
    editMode()
    await tick()
    expect(instance.option('disabled')).toBe(true)
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
