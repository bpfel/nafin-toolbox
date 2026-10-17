import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/svelte'
import userEvent from '@testing-library/user-event'
import { createEmptyVault, type VaultData } from '../lib/crypto/vault'
import * as budget from '../lib/budget/budgetEngine'

const store = vi.hoisted(() => ({
  vault: null as VaultData | null,
  readOnly: false,
}))

vi.mock('../lib/crypto/vaultStore.svelte', async () => {
  const { committerFor } = await import('../lib/sync/testing')
  return {
    getVaultState: () => ({
      get vault() { return store.vault },
      get readOnly() { return store.readOnly },
      currentVaultId: 'personal',
      households: [],
      currentHousehold: null,
      saving: false,
      dirty: false,
    }),
    commit: vi.fn(committerFor(() => store.vault)),
    saveNow: vi.fn(),
    closeEndedMonths: vi.fn(),
    listMembers: vi.fn(async () => []),
    belegUnsaved: () => false,
    switchTo: vi.fn(),
  }
})

import { saveNow } from '../lib/crypto/vaultStore.svelte'
import SpendingScreen from './SpendingScreen.svelte'

const frame = () => new Promise(r => requestAnimationFrame(() => r(null)))

beforeEach(() => {
  const seeded = createEmptyVault('Main')
  budget.seedDefaults(seeded, 'en', '2026-01')
  // Reactive, as the store's own vault is, so the list redraws when a record lands.
  const v = $state(seeded)
  store.vault = v
  store.readOnly = false
  vi.mocked(saveNow).mockClear()
})

afterEach(cleanup)

/**
 * A record is entered in a dialog, from the screen's "+", as Budget's entries
 * and Accounts' accounts are — not from a form that takes the screen.
 */
describe('adding a record', () => {
  test('an empty month says what Belege is for, and offers the one thing to do', () => {
    render(SpendingScreen, { userId: 1 })

    expect(screen.getByText(/Record what you spend/)).toBeTruthy()
    expect(screen.queryByLabelText('Amount')).toBeNull()
    expect(screen.getAllByRole('button', { name: 'Add record' }).length).toBeGreaterThan(0)
  })

  test('the dialog saves it at once, closes, and the month lists it', async () => {
    render(SpendingScreen, { userId: 1 })

    await userEvent.click(screen.getAllByRole('button', { name: 'Add record' })[0])
    const dialog = screen.getByRole('dialog', { name: 'Add record' })
    const amount = within(dialog).getByLabelText('Amount')
    await userEvent.click(amount)
    await frame()
    await userEvent.keyboard('12.50{Enter}')

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(saveNow).toHaveBeenCalled()
    expect(store.vault!.belege).toHaveLength(1)
    expect(store.vault!.belege[0]).toMatchObject({ amount: '12.50', createdBy: '1', entryId: null })
    expect(screen.getByText('This month')).toBeTruthy()
  })

  test('a reader is offered no way to add one', () => {
    store.readOnly = true
    render(SpendingScreen, { userId: 1 })

    expect(screen.queryByRole('button', { name: 'Add record' })).toBeNull()
  })
})
