import { cleanup, render, screen } from '@testing-library/svelte'
import { describe, test, expect, vi, afterEach } from 'vitest'
import type { PlanEntryView } from '../../lib/budget/budgetEngine'
import type { VaultData } from '../../lib/crypto/vault'
import { isEditing, toggleEditing, clearEditing } from '../../lib/util/editMode.svelte'

vi.mock('../../lib/crypto/vaultStore.svelte', () => ({
  markDirty: vi.fn(),
}))

import BudgetEntryRow from './BudgetEntryRow.svelte'
import BudgetTable from './BudgetTable.svelte'

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

describe('single-group budgets hide the group name', () => {
  // "Employment / Salary" is noise when Employment is the only group there is.
  // Rendered for real: the rule lives in the table's markup, so asserting it
  // anywhere else would only be restating the implementation.
  function vaultWith(groups: { id: string; name: string; type: 'income' | 'expense' }[]): VaultData {
    return {
      version: 4,
      accounts: [{
        id: 'main', name: 'Main', kind: 'transactional', currency: 'CHF',
        currentAmount: '0.00', lastCorrectedAt: '2026-01-01',
      }],
      budget: {
        categoryGroups: groups.map((g, i) => ({ ...g, sortOrder: (i + 1) * 10 })),
        categories: [],
        plan: [],
        archives: [],
      },
    }
  }

  function row(id: string, name: string, type: 'income' | 'expense', groupId: string, groupName: string): PlanEntryView {
    return {
      categoryId: id,
      categoryName: name,
      categoryType: type,
      categoryGroupId: groupId,
      categoryGroupName: groupName,
      plannedAmount: '100.00',
    }
  }

  test('one group on a side renders no header for it', () => {
    const vault = vaultWith([
      { id: 'g1', name: 'Employment', type: 'income' },
      { id: 'g2', name: 'Housing', type: 'expense' },
    ])
    render(BudgetTable, {
      props: {
        vault,
        entries: [
          row('i1', 'Salary', 'income', 'g1', 'Employment'),
          row('e1', 'Rent', 'expense', 'g2', 'Housing'),
        ],
        onsave: vi.fn(),
        oncategorycreated: vi.fn(),
        oncategorydeleted: vi.fn(),
      },
    })

    expect(screen.queryByText('Employment')).toBeNull()
    expect(screen.queryByText('Housing')).toBeNull()
    // The categories themselves are of course still listed.
    expect(screen.getByText('Salary')).toBeTruthy()
    expect(screen.getByText('Rent')).toBeTruthy()
  })

  test('a second group on a side brings both its headers back', () => {
    const vault = vaultWith([
      { id: 'g1', name: 'Employment', type: 'income' },
      { id: 'g2', name: 'Housing', type: 'expense' },
      { id: 'g3', name: 'Living', type: 'expense' },
    ])
    render(BudgetTable, {
      props: {
        vault,
        entries: [
          row('i1', 'Salary', 'income', 'g1', 'Employment'),
          row('e1', 'Rent', 'expense', 'g2', 'Housing'),
          row('e2', 'Food', 'expense', 'g3', 'Living'),
        ],
        onsave: vi.fn(),
        oncategorycreated: vi.fn(),
        oncategorydeleted: vi.fn(),
      },
    })

    expect(screen.getByText('Housing')).toBeTruthy()
    expect(screen.getByText('Living')).toBeTruthy()
    // Income still has only one group, so it stays unheaded.
    expect(screen.queryByText('Employment')).toBeNull()
  })
})
