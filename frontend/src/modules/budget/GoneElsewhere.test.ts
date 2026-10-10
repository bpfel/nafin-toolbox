import { committingTo } from '../../lib/sync/testing'
import { cleanup, render, screen } from '@testing-library/svelte'
import { describe, test, expect, vi, afterEach } from 'vitest'
import { createEmptyVault, type VaultData } from '../../lib/crypto/vault'
import * as engine from '../../lib/budget/budgetEngine'

vi.mock('../../lib/crypto/vaultStore.svelte', async () => (await import('../../lib/sync/testing')).storeMock())

import AddEntryModal from './AddEntryModal.svelte'
import EditCategoryModal from './EditCategoryModal.svelte'

/**
 * Scenario 34 of the save-queue plan: a form is open on something, and a
 * catch-up with somebody else's save takes that thing out of the vault.
 *
 * The form must say so in place and offer only Close — not save into nothing,
 * and not vanish with what the user had typed.
 */

afterEach(cleanup)

function withRent(): { vault: VaultData; rentId: string; housingId: string } {
  const vault = committingTo(createEmptyVault())
  const rent = engine.createEntry(vault, { name: 'Rent', type: 'expense', categoryName: 'Housing' })
  return { vault, rentId: rent.id, housingId: rent.categoryId }
}

/** The vault as it is after the catch-up: a new object, without the thing. */
function afterCatchUp(vault: VaultData, remove: (v: VaultData) => void): VaultData {
  const next = structuredClone(vault)
  remove(next)
  return next
}

describe('a form open on something deleted elsewhere', () => {
  test('an entry being edited says so, and offers only Close', async () => {
    const { vault, rentId } = withRent()
    const props = {
      type: 'expense' as const,
      categories: [],
      editEntry: { id: rentId, name: 'Rent', categoryName: 'Housing' },
      vault,
      oncreated: vi.fn(),
      onclose: vi.fn(),
    }
    const { rerender } = render(AddEntryModal, { props })
    expect(screen.queryByRole('alert')).toBeNull()

    await rerender({ ...props, vault: afterCatchUp(vault, v => engine.deleteEntry(v, rentId)) })

    expect(screen.getByRole('alert').textContent).toMatch(/deleted elsewhere/i)
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy()
  })

  test('a category being renamed says so, and offers only Close', async () => {
    const { vault, rentId, housingId } = withRent()
    const category = vault.budget.categories.find(c => c.id === housingId)!
    const props = { category, vault, onsaved: vi.fn(), onclose: vi.fn() }
    const { rerender } = render(EditCategoryModal, { props })

    await rerender({ ...props, vault: afterCatchUp(vault, v => engine.deleteEntry(v, rentId)) })

    expect(screen.getByRole('alert').textContent).toMatch(/deleted elsewhere/i)
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy()
  })
})
