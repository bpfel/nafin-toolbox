import { cleanup, render, screen } from '@testing-library/svelte'
import { describe, test, expect, vi, afterEach } from 'vitest'
import type { PlanEntryView } from '../../lib/budget/budgetEngine'
import { isEditing, toggleEditing, clearEditing } from '../../lib/util/editMode.svelte'

vi.mock('../../lib/crypto/vaultStore.svelte', () => ({
  markDirty: vi.fn(),
}))

import BudgetEntryRow from './BudgetEntryRow.svelte'

// Edit mode is module-global, so a test that leaves it on would leak into the
// next one. Reset alongside the DOM.
afterEach(() => {
  cleanup()
  clearEditing()
})

function entry(): PlanEntryView {
  return {
    categoryId: 'c1',
    categoryName: 'Rent',
    categoryType: 'expense',
    categoryGroupId: 'g1',
    categoryGroupName: 'Housing',
    plannedAmount: '1350.00',
  }
}

function renderRow() {
  return render(BudgetEntryRow, {
    props: {
      entry: entry(),
      onsave: vi.fn(),
      ondelete: vi.fn(),
      onedit: vi.fn(),
    },
  })
}

describe('edit mode — the budget is read-only by default', () => {
  test('structural affordances are hidden until edit mode is on', () => {
    renderRow()

    expect(screen.queryByLabelText(/drag to reorder/i)).toBeNull()
    expect(screen.queryByLabelText(/delete rent/i)).toBeNull()
    // The name is plain text, not a button that would open nothing.
    expect(screen.queryByRole('button', { name: 'Rent' })).toBeNull()
    expect(screen.getByText('Rent')).toBeTruthy()
  })

  test('they appear once edit mode is on', () => {
    toggleEditing('budget')
    renderRow()

    expect(screen.getByLabelText(/drag to reorder/i)).toBeTruthy()
    expect(screen.getByLabelText(/delete rent/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Rent' })).toBeTruthy()
  })

  // The point of the split: entering figures is the everyday act and must never
  // be behind a mode. Gating it would make the budget tiresome to actually use.
  test('amount inputs are available in BOTH modes', () => {
    const { unmount } = renderRow()
    expect(document.querySelectorAll('input[data-field]').length).toBeGreaterThan(0)
    unmount()

    toggleEditing('budget')
    renderRow()
    expect(document.querySelectorAll('input[data-field]').length).toBeGreaterThan(0)
  })
})

describe('editMode store', () => {
  test('modules unlock independently', () => {
    toggleEditing('budget')

    expect(isEditing('budget')).toBe(true)
    expect(isEditing('accounts')).toBe(false)
  })

  test('toggling twice returns to read-only', () => {
    toggleEditing('budget')
    toggleEditing('budget')

    expect(isEditing('budget')).toBe(false)
  })

  test('clearEditing locks everything — edit mode must not survive a logout', () => {
    toggleEditing('budget')
    toggleEditing('accounts')

    clearEditing()

    expect(isEditing('budget')).toBe(false)
    expect(isEditing('accounts')).toBe(false)
  })
})
