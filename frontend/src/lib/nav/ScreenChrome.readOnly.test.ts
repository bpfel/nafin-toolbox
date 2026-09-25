import { render, screen, cleanup } from '@testing-library/svelte'
import { describe, test, expect, vi, afterEach } from 'vitest'

/**
 * A reader in a household is offered nothing that edits.
 *
 * Its own file because it needs the vault store mocked, and the rest of
 * ScreenChrome's tests use the real one. What went wrong before: a reader could
 * switch the budget into edit mode, load the Swiss defaults, and the refused
 * save surfaced as "Something broke and the page stopped updating".
 */
const state = { readOnly: false, saving: false, dirty: false, households: [], currentHousehold: null }

vi.mock('../crypto/vaultStore.svelte', () => ({
  getVaultState: () => state,
  switchTo: vi.fn(),
}))

import ScreenChrome from './ScreenChrome.svelte'

afterEach(() => {
  cleanup()
  state.readOnly = false
})

describe('in a household this account may only read', () => {
  test('there is no edit toggle', () => {
    state.readOnly = true
    render(ScreenChrome, { title: 'Budget', editKey: 'budget' })

    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull()
  })

  test('which is still there anywhere this account may write', () => {
    render(ScreenChrome, { title: 'Budget', editKey: 'budget' })

    expect(screen.getByRole('button', { name: 'Edit' })).toBeTruthy()
  })
})
