import { cleanup, render, screen, fireEvent } from '@testing-library/svelte'
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

function renderRow(onedit = vi.fn()) {
  return {
    ...render(BudgetEntryRow, {
      props: {
        entry: entry(),
        ondelete: vi.fn(),
        onedit,
      },
    }),
    onedit,
  }
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

  // Reaching for the number is the obvious way to change it, so in edit mode the
  // amount opens the same dialog the category name does. In read-only it is text,
  // with nothing to click.
  test('the amount opens the dialog in edit mode', async () => {
    toggleEditing('budget')
    const { onedit } = renderRow()

    await fireEvent.click(screen.getByRole('button', { name: /edit planned per month for rent/i }))

    expect(onedit).toHaveBeenCalledWith('c1', 'Rent', 'expense', 'Housing', '1350.00')
  })

  test('the amount is inert when read-only', () => {
    renderRow()

    expect(screen.queryByRole('button', { name: /edit planned per month/i })).toBeNull()
    expect(screen.getByText('1\u2019350.00')).toBeTruthy()
  })

  // Amounts are not editable from the table in either mode. The category dialog
  // is the only place a planned amount is set, so there is no second field
  // writing the same value.
  test('the table never offers an amount field', () => {
    const { unmount } = renderRow()
    expect(document.querySelectorAll('input').length).toBe(0)
    expect(screen.getByText('1\u2019350.00')).toBeTruthy()
    unmount()

    toggleEditing('budget')
    renderRow()
    expect(document.querySelectorAll('input').length).toBe(0)
    expect(screen.getByText('1\u2019350.00')).toBeTruthy()
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
