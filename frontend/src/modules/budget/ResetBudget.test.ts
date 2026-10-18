import { cleanup, render, screen, fireEvent } from '@testing-library/svelte'
import { describe, test, expect, vi, afterEach } from 'vitest'
import type { VaultData } from '../../lib/crypto/vault'
import { toggleEditing, clearEditing } from '../../lib/util/editMode.svelte'

const committed = vi.fn()

// The real store, with the change spied on. A hand-rolled fake would be a
// plain object, and the module leans on `$state` deep-proxying the vault so an
// emptied entry list re-renders — reactivity a fake cannot model.
vi.mock('../../lib/crypto/vaultStore.svelte', async importOriginal => {
  const real = await importOriginal<typeof import('../../lib/crypto/vaultStore.svelte')>()
  // Spied on, and passed through: the change must still happen for the
  // screen to show it.
  const passOn = real.commit as (...args: unknown[]) => unknown
  const commit = ((...args: unknown[]) => {
    committed(...args)
    return passOn(...args)
  }) as typeof real.commit
  return { ...real, commit }
})

import { getVaultState } from '../../lib/crypto/vaultStore.svelte'
import BudgetModule from './BudgetModule.svelte'

const vaultState = getVaultState()

/** The vault the component is looking at, read back after the component edits it. */
function current(): VaultData {
  return vaultState.vault as VaultData
}

// Edit mode is module-global, so a test that leaves it on would leak.
afterEach(() => {
  cleanup()
  clearEditing()
  committed.mockClear()
})

function load(snapshots: VaultData['budget']['snapshots'] = []) {
  vaultState.vault = makeVault(snapshots)
}

function makeVault(snapshots: VaultData['budget']['snapshots'] = []): VaultData {
  return {
    version: 11,
    tour: { completedAt: null, dismissedAt: null },
    trust: { pins: {}, epochs: {} },
    people: {},
    belege: [],
    settlements: [],
    split: { mode: 'equal' as const },
    accounts: [],
    budget: {
      categories: [
        { id: 'g-income', name: 'Employment', side: 'income', sortOrder: 10 },
        { id: 'g-housing', name: 'Housing', side: 'expense', sortOrder: 20 },
      ],
      entries: [
        { id: 'salary', name: 'Salary', type: 'income', sortOrder: 10, archived: false, categoryId: 'g-income', sourceAccountId: null, sinkAccountId: null },
        { id: 'rent', name: 'Rent', type: 'expense', sortOrder: 20, archived: false, categoryId: 'g-housing', sourceAccountId: null, sinkAccountId: null },
      ],
      plan: [
        { entryId: 'salary', plannedAmount: '6000.00' },
        { entryId: 'rent', plannedAmount: '1350.00' },
      ],
      snapshots,
    },
  } as VaultData
}

const resetButton = () => screen.queryByRole('button', { name: 'Reset budget' })

describe('resetting the budget', () => {
  test('the button is hidden until edit mode is on', async () => {
    load()
    render(BudgetModule)

    expect(resetButton()).toBeNull()

    toggleEditing('budget')
    expect(await screen.findByRole('button', { name: 'Reset budget' })).toBeTruthy()
  })

  test('the button alone changes nothing — it asks first', async () => {
    load()
    toggleEditing('budget')
    render(BudgetModule)

    await fireEvent.click(resetButton()!)

    expect(await screen.findByRole('dialog', { name: 'Reset budget' })).toBeTruthy()
    expect(current().budget.entries).toHaveLength(2)
    expect(committed).not.toHaveBeenCalled()
  })

  test('cancelling leaves the budget alone', async () => {
    load()
    toggleEditing('budget')
    render(BudgetModule)

    await fireEvent.click(resetButton()!)
    await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(current().budget.entries).toHaveLength(2)
    expect(current().budget.plan).toHaveLength(2)
    expect(committed).not.toHaveBeenCalled()
  })

  test('confirming empties the budget', async () => {
    load()
    toggleEditing('budget')
    render(BudgetModule)

    await fireEvent.click(resetButton()!)
    // The dialog's own button, not the one in the toolbar behind it.
    const dialog = await screen.findByRole('dialog', { name: 'Reset budget' })
    await fireEvent.click(dialog.querySelector('.delete') as HTMLElement)

    expect(current().budget.entries).toEqual([])
    expect(current().budget.categories).toEqual([])
    expect(current().budget.plan).toEqual([])
    expect(committed).toHaveBeenCalled()
  })

  test('the setup screen comes back after a reset', async () => {
    load()
    toggleEditing('budget')
    render(BudgetModule)

    await fireEvent.click(resetButton()!)
    const dialog = await screen.findByRole('dialog', { name: 'Reset budget' })
    await fireEvent.click(dialog.querySelector('.delete') as HTMLElement)

    // An empty budget is what the setup screen is for; a blank table would be a
    // dead end offering nothing.
    expect(await screen.findByRole('heading', { name: 'Set up your budget' })).toBeTruthy()
  })

  test('says snapshots survive when there are any', async () => {
    load([{ id: 'a1', name: 'Q1', createdAt: '2026-01-01', lines: [] }])
    toggleEditing('budget')
    render(BudgetModule)

    await fireEvent.click(resetButton()!)

    expect(await screen.findByText(/1 snapshot is/i)).toBeTruthy()
  })

  test('warns when there are no snapshots', async () => {
    load()
    toggleEditing('budget')
    render(BudgetModule)

    await fireEvent.click(resetButton()!)

    expect(await screen.findByText(/no snapshots/i)).toBeTruthy()
  })
})
