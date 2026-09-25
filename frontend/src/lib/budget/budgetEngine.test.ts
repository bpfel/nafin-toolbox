import { describe, test, expect, beforeEach } from 'vitest'
import {
  listCategories,
  createCategory,
  updateCategory,
  mergeCategory,
  findCategoryConflict,
  entriesInCategory,
  getOrCreateCategory,
  listEntries,
  createEntry,
  updateEntry,
  deleteEntry,
  reorderEntries,
  plannedFor,
  setPlanned,
  getPlanSummary,
  listSnapshots,
  takeSnapshot,
  renameSnapshot,
  resetBudget,
  deleteSnapshot,
  seedDefaults,
  seedSharedDefaults,
} from './budgetEngine'
import { createEmptyVault, holdsMoney, savesTowardsTarget, type VaultData } from '../crypto/vault'
import { isLegalEntryRouting, isLegalRouting, primaryAccountId } from '../accounts/routing'

describe('listCategories', () => {
  test('returns empty array for empty vault', () => {
    const vault = createEmptyVault()
    const categories = listCategories(vault)

    expect(categories).toEqual([])
  })

  test('returns categories sorted by sortOrder', () => {
    const vault = createEmptyVault()
    vault.budget.categories = [
      { id: '3', name: 'Third', side: 'expense', sortOrder: 30 },
      { id: '1', name: 'First', side: 'income', sortOrder: 10 },
      { id: '2', name: 'Second', side: 'expense', sortOrder: 20 },
    ]

    const categories = listCategories(vault)

    expect(categories).toHaveLength(3)
    expect(categories[0].name).toBe('First')
    expect(categories[1].name).toBe('Second')
    expect(categories[2].name).toBe('Third')
  })

  test('handles categories with same sortOrder', () => {
    const vault = createEmptyVault()
    vault.budget.categories = [
      { id: '1', name: 'A', side: 'income', sortOrder: 10 },
      { id: '2', name: 'B', side: 'expense', sortOrder: 10 },
    ]

    const categories = listCategories(vault)

    expect(categories).toHaveLength(2)
  })

  test('does not mutate original array', () => {
    const vault = createEmptyVault()
    vault.budget.categories = [
      { id: '2', name: 'Second', side: 'expense', sortOrder: 20 },
      { id: '1', name: 'First', side: 'income', sortOrder: 10 },
    ]

    const originalOrder = [...vault.budget.categories]
    listCategories(vault)

    expect(vault.budget.categories).toEqual(originalOrder)
  })

  test('handles negative sortOrder values', () => {
    const vault = createEmptyVault()
    vault.budget.categories = [
      { id: '1', name: 'Negative', side: 'income', sortOrder: -10 },
      { id: '2', name: 'Zero', side: 'expense', sortOrder: 0 },
      { id: '3', name: 'Positive', side: 'expense', sortOrder: 10 },
    ]

    const categories = listCategories(vault)

    expect(categories[0].name).toBe('Negative')
    expect(categories[1].name).toBe('Zero')
    expect(categories[2].name).toBe('Positive')
  })
})

describe('createCategory', () => {
  test('creates income category successfully', () => {
    const vault = createEmptyVault()
    const category = createCategory(vault, 'Employment', 'income')

    expect(category.name).toBe('Employment')
    expect(category.side).toBe('income')
    expect(category.sortOrder).toBe(10)
    expect(category.id).toBeTruthy()
    expect(vault.budget.categories).toContain(category)
  })

  test('creates expense category successfully', () => {
    const vault = createEmptyVault()
    const category = createCategory(vault, 'Housing', 'expense')

    expect(category.name).toBe('Housing')
    expect(category.side).toBe('expense')
    expect(category.sortOrder).toBe(10)
  })

  test('creates category with custom sortOrder', () => {
    const vault = createEmptyVault()
    const category = createCategory(vault, 'Custom', 'income', 99)

    expect(category.sortOrder).toBe(99)
  })

  test('auto-increments sortOrder by 10', () => {
    const vault = createEmptyVault()
    const category1 = createCategory(vault, 'First', 'income')
    const category2 = createCategory(vault, 'Second', 'income')
    const category3 = createCategory(vault, 'Third', 'income')

    expect(category1.sortOrder).toBe(10)
    expect(category2.sortOrder).toBe(20)
    expect(category3.sortOrder).toBe(30)
  })

  test('generates unique IDs', () => {
    const vault = createEmptyVault()
    const category1 = createCategory(vault, 'First', 'income')
    const category2 = createCategory(vault, 'Second', 'income')

    expect(category1.id).not.toBe(category2.id)
  })

  test('handles empty name', () => {
    const vault = createEmptyVault()
    const category = createCategory(vault, '', 'income')

    expect(category.name).toBe('')
    expect(vault.budget.categories).toContain(category)
  })

  test('handles very long name', () => {
    const vault = createEmptyVault()
    const longName = 'A'.repeat(1000)
    const category = createCategory(vault, longName, 'income')

    expect(category.name).toBe(longName)
  })

  test('handles unicode characters in name', () => {
    const vault = createEmptyVault()
    const category = createCategory(vault, '雇用 🏢 Travail', 'income')

    expect(category.name).toBe('雇用 🏢 Travail')
  })

  test('calculates sortOrder from max of existing categories', () => {
    const vault = createEmptyVault()
    vault.budget.categories = [
      { id: '1', name: 'First', side: 'income', sortOrder: 5 },
      { id: '2', name: 'Second', side: 'expense', sortOrder: 100 },
    ]

    const category = createCategory(vault, 'Third', 'income')

    expect(category.sortOrder).toBe(110) // max(5, 100) + 10
  })

  test('handles zero sortOrder in existing categories', () => {
    const vault = createEmptyVault()
    vault.budget.categories = [
      { id: '1', name: 'Zero', side: 'income', sortOrder: 0 },
    ]

    const category = createCategory(vault, 'Next', 'income')

    expect(category.sortOrder).toBe(10)
  })

  test('handles negative sortOrder in existing categories', () => {
    const vault = createEmptyVault()
    vault.budget.categories = [
      { id: '1', name: 'Negative', side: 'income', sortOrder: -50 },
    ]

    const category = createCategory(vault, 'Next', 'income')

    expect(category.sortOrder).toBe(-40)
  })
})

describe('getOrCreateCategory', () => {
  test('returns existing category if found', () => {
    const vault = createEmptyVault()
    const existing = createCategory(vault, 'Employment', 'income')

    const result = getOrCreateCategory(vault, 'Employment', 'income')

    expect(result).toBe(existing)
    expect(vault.budget.categories).toHaveLength(1)
  })

  test('creates new category if not found', () => {
    const vault = createEmptyVault()

    const result = getOrCreateCategory(vault, 'Employment', 'income')

    expect(result.name).toBe('Employment')
    expect(result.side).toBe('income')
    expect(vault.budget.categories).toHaveLength(1)
  })

  test('distinguishes between income and expense types', () => {
    const vault = createEmptyVault()
    createCategory(vault, 'Transfer', 'income')

    const result = getOrCreateCategory(vault, 'Transfer', 'expense')

    expect(vault.budget.categories).toHaveLength(2)
    expect(result.side).toBe('expense')
  })

  test('matches by exact name', () => {
    const vault = createEmptyVault()
    createCategory(vault, 'Housing', 'expense')

    const result = getOrCreateCategory(vault, 'housing', 'expense')

    expect(vault.budget.categories).toHaveLength(2)
    expect(result.name).toBe('housing')
  })

  test('handles empty name', () => {
    const vault = createEmptyVault()
    const category1 = getOrCreateCategory(vault, '', 'income')
    const category2 = getOrCreateCategory(vault, '', 'income')

    expect(category1).toBe(category2)
    expect(vault.budget.categories).toHaveLength(1)
  })
})

describe('listEntries', () => {
  test('returns empty array for empty vault', () => {
    const vault = createEmptyVault()
    const entries = listEntries(vault)

    expect(entries).toEqual([])
  })

  test('excludes archived entries by default', () => {
    const vault = createEmptyVault()
    vault.budget.entries = [
      { id: '1', name: 'Active', type: 'income', sortOrder: 10, archived: false, categoryId: 'g1', sourceAccountId: null, sinkAccountId: 'acc1' },
      { id: '2', name: 'Archived', type: 'expense', sortOrder: 20, archived: true, categoryId: 'g2', sourceAccountId: 'acc1', sinkAccountId: null },
    ]

    const entries = listEntries(vault)

    expect(entries).toHaveLength(1)
    expect(entries[0].name).toBe('Active')
  })

  test('includes archived entries when requested', () => {
    const vault = createEmptyVault()
    vault.budget.entries = [
      { id: '1', name: 'Active', type: 'income', sortOrder: 10, archived: false, categoryId: 'g1', sourceAccountId: null, sinkAccountId: 'acc1' },
      { id: '2', name: 'Archived', type: 'expense', sortOrder: 20, archived: true, categoryId: 'g2', sourceAccountId: 'acc1', sinkAccountId: null },
    ]

    const entries = listEntries(vault, true)

    expect(entries).toHaveLength(2)
  })

  test('returns entries sorted by sortOrder', () => {
    const vault = createEmptyVault()
    vault.budget.entries = [
      { id: '3', name: 'Third', type: 'expense', sortOrder: 30, archived: false, categoryId: 'g1', sourceAccountId: 'acc1', sinkAccountId: null },
      { id: '1', name: 'First', type: 'income', sortOrder: 10, archived: false, categoryId: 'g1', sourceAccountId: null, sinkAccountId: 'acc1' },
      { id: '2', name: 'Second', type: 'expense', sortOrder: 20, archived: false, categoryId: 'g1', sourceAccountId: 'acc1', sinkAccountId: null },
    ]

    const entries = listEntries(vault)

    expect(entries[0].name).toBe('First')
    expect(entries[1].name).toBe('Second')
    expect(entries[2].name).toBe('Third')
  })

  test('does not mutate original array', () => {
    const vault = createEmptyVault()
    vault.budget.entries = [
      { id: '2', name: 'Second', type: 'expense', sortOrder: 20, archived: false, categoryId: 'g1', sourceAccountId: 'acc1', sinkAccountId: null },
      { id: '1', name: 'First', type: 'income', sortOrder: 10, archived: false, categoryId: 'g1', sourceAccountId: null, sinkAccountId: 'acc1' },
    ]

    const originalOrder = [...vault.budget.entries]
    listEntries(vault)

    expect(vault.budget.entries).toEqual(originalOrder)
  })
})

describe('createEntry', () => {
  test('creates entry successfully', () => {
    const vault = createEmptyVault()
    const entry = createEntry(vault, {
      name: 'Salary',
      type: 'income',
      categoryName: 'Employment',
    })

    expect(entry.name).toBe('Salary')
    expect(entry.type).toBe('income')
    expect(entry.sortOrder).toBe(10)
    expect(entry.archived).toBe(false)
    expect(entry.id).toBeTruthy()
    expect(entry.categoryId).toBeTruthy()
    expect(vault.budget.entries).toContain(entry)
  })

  test('creates entry with custom sortOrder', () => {
    const vault = createEmptyVault()
    const entry = createEntry(vault, {
      name: 'Test',
      type: 'income',
      categoryName: 'Category',
      sortOrder: 99,
    })

    expect(entry.sortOrder).toBe(99)
  })

  test('auto-increments sortOrder', () => {
    const vault = createEmptyVault()
    const cat1 = createEntry(vault, { name: 'First', type: 'income', categoryName: 'Category' })
    const cat2 = createEntry(vault, { name: 'Second', type: 'income', categoryName: 'Category' })

    expect(cat1.sortOrder).toBe(10)
    expect(cat2.sortOrder).toBe(20)
  })

  test('creates category if it does not exist', () => {
    const vault = createEmptyVault()
    const entry = createEntry(vault, {
      name: 'Salary',
      type: 'income',
      categoryName: 'Employment',
    })

    expect(vault.budget.categories).toHaveLength(1)
    expect(vault.budget.categories[0].name).toBe('Employment')
    expect(entry.categoryId).toBe(vault.budget.categories[0].id)
  })

  test('reuses existing category', () => {
    const vault = createEmptyVault()
    const category = createCategory(vault, 'Employment', 'income')

    const entry = createEntry(vault, {
      name: 'Salary',
      type: 'income',
      categoryName: 'Employment',
    })

    expect(vault.budget.categories).toHaveLength(1)
    expect(entry.categoryId).toBe(category.id)
  })

  test('generates unique IDs', () => {
    const vault = createEmptyVault()
    const cat1 = createEntry(vault, { name: 'First', type: 'income', categoryName: 'Category' })
    const cat2 = createEntry(vault, { name: 'Second', type: 'income', categoryName: 'Category' })

    expect(cat1.id).not.toBe(cat2.id)
  })

  test('handles empty name', () => {
    const vault = createEmptyVault()
    const entry = createEntry(vault, { name: '', type: 'income', categoryName: 'Category' })

    expect(entry.name).toBe('')
  })

  test('handles unicode characters', () => {
    const vault = createEmptyVault()
    const entry = createEntry(vault, { name: '給料 💰', type: 'income', categoryName: '雇用' })

    expect(entry.name).toBe('給料 💰')
    expect(vault.budget.categories[0].name).toBe('雇用')
  })
})

describe('updateEntry — routing stays legal across a type change', () => {
  test('flipping income to expense re-derives routing instead of leaving a contradiction', () => {
    const vault = createEmptyVault()
    const primary = vault.accounts[0].id
    const entry = createEntry(vault, { name: 'Salary', type: 'income', categoryName: 'Work' })
    expect(entry.sourceAccountId).toBe(null)
    expect(entry.sinkAccountId).toBe(primary)

    const updated = updateEntry(vault, entry.id, { type: 'expense' })

    // Keeping (null, primary) would be an illegal expense row.
    expect(updated?.sourceAccountId).toBe(primary)
    expect(updated?.sinkAccountId).toBe(null)
    expect(isLegalRouting('expense', updated!.sourceAccountId, updated!.sinkAccountId)).toBe(true)
  })

  test('flipping expense to income re-derives routing', () => {
    const vault = createEmptyVault()
    const primary = vault.accounts[0].id
    const entry = createEntry(vault, { name: 'Rent', type: 'expense', categoryName: 'Housing' })

    const updated = updateEntry(vault, entry.id, { type: 'income' })

    expect(updated?.sourceAccountId).toBe(null)
    expect(updated?.sinkAccountId).toBe(primary)
    expect(isLegalRouting('income', updated!.sourceAccountId, updated!.sinkAccountId)).toBe(true)
  })

  test('a reserve cannot survive a move to income', () => {
    const vault = createEmptyVault()
    const primary = vault.accounts[0].id
    const entry = createEntry(vault, { name: 'Taxes', type: 'expense', categoryName: 'Tax' })
    entry.sinkAccountId = primary
    entry.reserve = {
      targetAmount: '10000.00',
      periodMonths: 12,
      anchorMonth: '2026-09',
    }

    const updated = updateEntry(vault, entry.id, { type: 'income' })

    expect(updated?.reserve).toBeUndefined()
  })

  test('routing is untouched when the type is set to its current value', () => {
    const vault = createEmptyVault()
    const entry = createEntry(vault, { name: 'Groceries', type: 'expense', categoryName: 'Living' })
    entry.sinkAccountId = vault.accounts[0].id // hand-routed as a set-aside

    updateEntry(vault, entry.id, { type: 'expense', name: 'Food' })

    expect(entry.sinkAccountId).toBe(vault.accounts[0].id)
    expect(entry.name).toBe('Food')
  })
})

describe('updateEntry', () => {
  test('updates entry name', () => {
    const vault = createEmptyVault()
    const entry = createEntry(vault, { name: 'Old Name', type: 'income', categoryName: 'Category' })

    const updated = updateEntry(vault, entry.id, { name: 'New Name' })

    expect(updated?.name).toBe('New Name')
    expect(vault.budget.entries[0].name).toBe('New Name')
  })

  test('updates entry type', () => {
    const vault = createEmptyVault()
    const entry = createEntry(vault, { name: 'Test', type: 'income', categoryName: 'Category' })

    const updated = updateEntry(vault, entry.id, { type: 'expense' })

    expect(updated?.type).toBe('expense')
  })

  test('updates sortOrder', () => {
    const vault = createEmptyVault()
    const entry = createEntry(vault, { name: 'Test', type: 'income', categoryName: 'Category' })

    const updated = updateEntry(vault, entry.id, { sortOrder: 99 })

    expect(updated?.sortOrder).toBe(99)
  })

  test('snapshots entry', () => {
    const vault = createEmptyVault()
    const entry = createEntry(vault, { name: 'Test', type: 'income', categoryName: 'Category' })

    const updated = updateEntry(vault, entry.id, { archived: true })

    expect(updated?.archived).toBe(true)
  })

  test('unarchives entry', () => {
    const vault = createEmptyVault()
    const entry = createEntry(vault, { name: 'Test', type: 'income', categoryName: 'Category' })
    vault.budget.entries[0].archived = true

    const updated = updateEntry(vault, entry.id, { archived: false })

    expect(updated?.archived).toBe(false)
  })

  test('updates categoryName by creating new category', () => {
    const vault = createEmptyVault()
    const entry = createEntry(vault, { name: 'Test', type: 'income', categoryName: 'Old Category' })

    const updated = updateEntry(vault, entry.id, { categoryName: 'New Category' })

    // 'Old Category' held only this entry, so moving it out leaves nothing
    // behind to keep.
    expect(vault.budget.categories).toHaveLength(1)
    expect(vault.budget.categories[0].name).toBe('New Category')
    expect(updated?.categoryId).toBe(vault.budget.categories[0].id)
  })

  test('updates categoryName by reusing existing category', () => {
    const vault = createEmptyVault()
    const category1 = createCategory(vault, 'Category 1', 'income')
    const category2 = createCategory(vault, 'Category 2', 'income')
    const entry = createEntry(vault, { name: 'Test', type: 'income', categoryName: 'Category 1' })

    const updated = updateEntry(vault, entry.id, { categoryName: 'Category 2' })

    // Reused rather than duplicated — and Category 1, now empty, is swept.
    expect(updated?.categoryId).toBe(category2.id)
    expect(vault.budget.categories.map(g => g.name)).toEqual(['Category 2'])
  })

  test('returns null for non-existent entry', () => {
    const vault = createEmptyVault()

    const updated = updateEntry(vault, 'non-existent', { name: 'New Name' })

    expect(updated).toBeNull()
  })

  test('updates multiple fields at once', () => {
    const vault = createEmptyVault()
    const entry = createEntry(vault, { name: 'Test', type: 'income', categoryName: 'Category' })

    const updated = updateEntry(vault, entry.id, {
      name: 'Updated',
      archived: true,
      sortOrder: 99,
    })

    expect(updated?.name).toBe('Updated')
    expect(updated?.archived).toBe(true)
    expect(updated?.sortOrder).toBe(99)
  })

  test('handles empty update object', () => {
    const vault = createEmptyVault()
    const entry = createEntry(vault, { name: 'Test', type: 'income', categoryName: 'Category' })
    const originalName = entry.name

    const updated = updateEntry(vault, entry.id, {})

    expect(updated?.name).toBe(originalName)
  })
})

describe('deleteEntry', () => {
  test('removes entry from vault', () => {
    const vault = createEmptyVault()
    const entry = createEntry(vault, { name: 'Test', type: 'income', categoryName: 'Category' })

    deleteEntry(vault, entry.id)

    expect(vault.budget.entries).toHaveLength(0)
  })

  test('removes the deleted entry’s line from the plan', () => {
    const vault = createEmptyVault()
    const entry = createEntry(vault, { name: 'Test', type: 'income', categoryName: 'Category' })
    setPlanned(vault, entry.id, '100.00')

    deleteEntry(vault, entry.id)

    expect(vault.budget.plan).toHaveLength(0)
  })

  test('does not affect plan lines for other entries', () => {
    const vault = createEmptyVault()
    const cat1 = createEntry(vault, { name: 'Cat1', type: 'income', categoryName: 'Category' })
    const cat2 = createEntry(vault, { name: 'Cat2', type: 'income', categoryName: 'Category' })
    setPlanned(vault, cat1.id, '100.00')
    setPlanned(vault, cat2.id, '200.00')

    deleteEntry(vault, cat1.id)

    expect(vault.budget.plan).toHaveLength(1)
    expect(vault.budget.plan[0].entryId).toBe(cat2.id)
  })

  test('handles deleting non-existent entry', () => {
    const vault = createEmptyVault()

    expect(() => deleteEntry(vault, 'non-existent')).not.toThrow()
    expect(vault.budget.entries).toHaveLength(0)
  })

  test('handles empty vault', () => {
    const vault = createEmptyVault()

    expect(() => deleteEntry(vault, 'any-id')).not.toThrow()
  })
})

describe('reorderEntries', () => {
  test('updates sortOrder for all entries', () => {
    const vault = createEmptyVault()
    const cat1 = createEntry(vault, { name: 'First', type: 'income', categoryName: 'Category' })
    const cat2 = createEntry(vault, { name: 'Second', type: 'income', categoryName: 'Category' })
    const cat3 = createEntry(vault, { name: 'Third', type: 'income', categoryName: 'Category' })

    reorderEntries(vault, [cat3.id, cat1.id, cat2.id])

    expect(vault.budget.entries.find(c => c.id === cat3.id)?.sortOrder).toBe(10)
    expect(vault.budget.entries.find(c => c.id === cat1.id)?.sortOrder).toBe(20)
    expect(vault.budget.entries.find(c => c.id === cat2.id)?.sortOrder).toBe(30)
  })

  test('handles empty array', () => {
    const vault = createEmptyVault()
    createEntry(vault, { name: 'Test', type: 'income', categoryName: 'Category' })

    expect(() => reorderEntries(vault, [])).not.toThrow()
  })

  test('handles non-existent entry IDs', () => {
    const vault = createEmptyVault()
    const cat = createEntry(vault, { name: 'Test', type: 'income', categoryName: 'Category' })

    reorderEntries(vault, ['non-existent', cat.id])

    // Only the existing entry should be reordered
    expect(vault.budget.entries.find(c => c.id === cat.id)?.sortOrder).toBe(20)
  })

  test('handles single entry', () => {
    const vault = createEmptyVault()
    const cat = createEntry(vault, { name: 'Test', type: 'income', categoryName: 'Category' })

    reorderEntries(vault, [cat.id])

    expect(vault.budget.entries.find(c => c.id === cat.id)?.sortOrder).toBe(10)
  })
})

describe('plannedFor and setPlanned', () => {
  test('an entry with no plan line reads 0.00', () => {
    const vault = createEmptyVault()
    const entry = createEntry(vault, { name: 'Rent', type: 'expense', categoryName: 'Housing' })

    expect(plannedFor(vault, entry.id)).toBe('0.00')
    expect(vault.budget.plan).toHaveLength(0)
  })

  test('an unknown entry reads 0.00 rather than throwing', () => {
    const vault = createEmptyVault()

    expect(plannedFor(vault, 'no-such-entry')).toBe('0.00')
  })

  test('setPlanned creates the line', () => {
    const vault = createEmptyVault()
    const entry = createEntry(vault, { name: 'Rent', type: 'expense', categoryName: 'Housing' })

    setPlanned(vault, entry.id, '1350.00')

    expect(vault.budget.plan).toEqual([{ entryId: entry.id, plannedAmount: '1350.00' }])
    expect(plannedFor(vault, entry.id)).toBe('1350.00')
  })

  test('setPlanned updates in place instead of adding a second line', () => {
    const vault = createEmptyVault()
    const entry = createEntry(vault, { name: 'Rent', type: 'expense', categoryName: 'Housing' })

    setPlanned(vault, entry.id, '1350.00')
    setPlanned(vault, entry.id, '1400.00')

    expect(vault.budget.plan).toHaveLength(1)
    expect(plannedFor(vault, entry.id)).toBe('1400.00')
  })

  test('the amount stays the exact decimal string it was given', () => {
    const vault = createEmptyVault()
    const entry = createEntry(vault, { name: 'Odd', type: 'expense', categoryName: 'Living' })

    // Money never becomes a number on the way through: 1234.50 must not come
    // back as 1234.5, and a large amount must not pick up floating-point noise.
    setPlanned(vault, entry.id, '1234.50')
    expect(plannedFor(vault, entry.id)).toBe('1234.50')

    setPlanned(vault, entry.id, '999999999.99')
    expect(plannedFor(vault, entry.id)).toBe('999999999.99')

    setPlanned(vault, entry.id, '-100.00')
    expect(plannedFor(vault, entry.id)).toBe('-100.00')

    setPlanned(vault, entry.id, '')
    expect(plannedFor(vault, entry.id)).toBe('')
  })

  test('each entry has its own line', () => {
    const vault = createEmptyVault()
    const rent = createEntry(vault, { name: 'Rent', type: 'expense', categoryName: 'Housing' })
    const food = createEntry(vault, { name: 'Food', type: 'expense', categoryName: 'Living' })

    setPlanned(vault, rent.id, '1350.00')
    setPlanned(vault, food.id, '500.00')

    expect(plannedFor(vault, rent.id)).toBe('1350.00')
    expect(plannedFor(vault, food.id)).toBe('500.00')
  })
})

describe('getPlanSummary', () => {
  test('returns an empty summary for an empty vault', () => {
    const vault = createEmptyVault()

    const summary = getPlanSummary(vault)

    expect(summary.entries).toEqual([])
    expect(summary.totalPlannedIncome).toBe('0.00')
    expect(summary.totalPlannedExpenses).toBe('0.00')
    expect(summary.plannedBalance).toBe('0.00')
  })

  test('calculates totals correctly', () => {
    const vault = createEmptyVault()
    const income = createEntry(vault, { name: 'Salary', type: 'income', categoryName: 'Employment' })
    const expense1 = createEntry(vault, { name: 'Rent', type: 'expense', categoryName: 'Housing' })
    const expense2 = createEntry(vault, { name: 'Food', type: 'expense', categoryName: 'Living' })

    setPlanned(vault, income.id, '5000.00')
    setPlanned(vault, expense1.id, '1500.00')
    setPlanned(vault, expense2.id, '500.00')

    const summary = getPlanSummary(vault)

    expect(summary.totalPlannedIncome).toBe('5000.00')
    expect(summary.totalPlannedExpenses).toBe('2000.00')
    expect(summary.plannedBalance).toBe('3000.00')
  })

  test('a fully assigned plan balances to 0.00', () => {
    const vault = createEmptyVault()
    const income = createEntry(vault, { name: 'Salary', type: 'income', categoryName: 'Employment' })
    const expense = createEntry(vault, { name: 'Everything', type: 'expense', categoryName: 'Living' })

    setPlanned(vault, income.id, '6000.00')
    setPlanned(vault, expense.id, '6000.00')

    // The zero-based reading the budget is built around: nothing left unassigned.
    expect(getPlanSummary(vault).plannedBalance).toBe('0.00')
  })

  test('shows every entry, including those with no plan line', () => {
    const vault = createEmptyVault()
    createEntry(vault, { name: 'Salary', type: 'income', categoryName: 'Employment' })
    createEntry(vault, { name: 'Rent', type: 'expense', categoryName: 'Housing' })

    const summary = getPlanSummary(vault)

    expect(summary.entries).toHaveLength(2)
    expect(summary.entries[0].plannedAmount).toBe('0.00')
    expect(summary.entries[1].plannedAmount).toBe('0.00')
  })

  test('excludes archived entries', () => {
    const vault = createEmptyVault()
    const active = createEntry(vault, { name: 'Active', type: 'income', categoryName: 'Category' })
    const archived = createEntry(vault, { name: 'Archived', type: 'income', categoryName: 'Category' })
    setPlanned(vault, archived.id, '999.00')
    updateEntry(vault, archived.id, { archived: true })

    const summary = getPlanSummary(vault)

    expect(summary.entries).toHaveLength(1)
    expect(summary.entries[0].entryId).toBe(active.id)
    // An archived entry's amount must not leak into the totals either.
    expect(summary.totalPlannedIncome).toBe('0.00')
  })

  test('keeps the entry sort order', () => {
    const vault = createEmptyVault()
    const third = createEntry(vault, { name: 'Third', type: 'expense', categoryName: 'G', sortOrder: 30 })
    const first = createEntry(vault, { name: 'First', type: 'expense', categoryName: 'G', sortOrder: 10 })
    const second = createEntry(vault, { name: 'Second', type: 'expense', categoryName: 'G', sortOrder: 20 })

    const summary = getPlanSummary(vault)

    expect(summary.entries.map(e => e.entryId)).toEqual([first.id, second.id, third.id])
  })

  test('handles a negative balance', () => {
    const vault = createEmptyVault()
    const income = createEntry(vault, { name: 'Salary', type: 'income', categoryName: 'Employment' })
    const expense = createEntry(vault, { name: 'Rent', type: 'expense', categoryName: 'Housing' })

    setPlanned(vault, income.id, '1000.00')
    setPlanned(vault, expense.id, '2000.00')

    expect(getPlanSummary(vault).plannedBalance).toBe('-1000.00')
  })

  test('handles decimal precision', () => {
    const vault = createEmptyVault()
    const income = createEntry(vault, { name: 'Salary', type: 'income', categoryName: 'Employment' })
    setPlanned(vault, income.id, '1234.56')

    expect(getPlanSummary(vault).totalPlannedIncome).toBe('1234.56')
  })

  test('includes entry metadata in entries', () => {
    const vault = createEmptyVault()
    const category = createCategory(vault, 'Employment', 'income')
    const entry = createEntry(vault, {
      name: 'Salary',
      type: 'income',
      categoryName: 'Employment',
    })

    const summary = getPlanSummary(vault)

    expect(summary.entries[0].entryId).toBe(entry.id)
    expect(summary.entries[0].entryName).toBe('Salary')
    expect(summary.entries[0].entryType).toBe('income')
    expect(summary.entries[0].categoryId).toBe(category.id)
    expect(summary.entries[0].categoryName).toBe('Employment')
  })

  test('handles an entry with a missing category', () => {
    const vault = createEmptyVault()
    vault.budget.entries = [
      { id: 'cat1', name: 'Test', type: 'income', sortOrder: 10, archived: false, categoryId: 'missing-category', sourceAccountId: null, sinkAccountId: 'acc1' },
    ]

    expect(getPlanSummary(vault).entries[0].categoryName).toBe('')
  })
})

describe('takeSnapshot', () => {
  function planned(vault: VaultData) {
    const salary = createEntry(vault, { name: 'Salary', type: 'income', categoryName: 'Employment' })
    const rent = createEntry(vault, { name: 'Rent', type: 'expense', categoryName: 'Housing' })
    setPlanned(vault, salary.id, '6000.00')
    setPlanned(vault, rent.id, '1350.00')
    return { salary, rent }
  }

  test('snapshots the plan as names and amounts', () => {
    const vault = createEmptyVault()
    planned(vault)

    const snapshot = takeSnapshot(vault, '2026 baseline')

    expect(snapshot.name).toBe('2026 baseline')
    expect(snapshot.id).toBeTruthy()
    expect(snapshot.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(snapshot.lines).toEqual([
      { entryName: 'Salary', categoryName: 'Employment', type: 'income', plannedAmount: '6000.00' },
      { entryName: 'Rent', categoryName: 'Housing', type: 'expense', plannedAmount: '1350.00' },
    ])
    expect(vault.budget.snapshots).toContain(snapshot)
  })

  test('includes entries left at 0.00, so the snapshot reads like the plan did', () => {
    const vault = createEmptyVault()
    createEntry(vault, { name: 'Holidays', type: 'expense', categoryName: 'Lifestyle' })

    const snapshot = takeSnapshot(vault, 'Empty start')

    expect(snapshot.lines).toHaveLength(1)
    expect(snapshot.lines[0].plannedAmount).toBe('0.00')
  })

  test('does not snapshot archived entries', () => {
    const vault = createEmptyVault()
    const { rent } = planned(vault)
    updateEntry(vault, rent.id, { archived: true })

    const snapshot = takeSnapshot(vault, 'After archiving Rent')

    expect(snapshot.lines.map(l => l.entryName)).toEqual(['Salary'])
  })

  test('rejects an empty or whitespace-only name', () => {
    const vault = createEmptyVault()
    planned(vault)

    expect(() => takeSnapshot(vault, '')).toThrow(/name/)
    expect(() => takeSnapshot(vault, '   ')).toThrow(/name/)
    expect(() => takeSnapshot(vault, '\t\n')).toThrow(/name/)
    // A rejected snapshot must not be half-stored.
    expect(vault.budget.snapshots).toHaveLength(0)
  })

  test('trims the name', () => {
    const vault = createEmptyVault()

    expect(takeSnapshot(vault, '  March review  ').name).toBe('March review')
  })

  test('renaming an entry afterwards does not rewrite the snapshot', () => {
    const vault = createEmptyVault()
    const { rent } = planned(vault)
    const snapshot = takeSnapshot(vault, 'Before the rename')

    updateEntry(vault, rent.id, { name: 'Rent (new flat)', categoryName: 'Accommodation' })

    // The snapshot records what the plan said at the time. A later rename is a
    // fact about today's budget, not about the snapshot.
    expect(snapshot.lines[1].entryName).toBe('Rent')
    expect(snapshot.lines[1].categoryName).toBe('Housing')
    expect(listSnapshots(vault)[0].lines[1].entryName).toBe('Rent')
  })

  test('deleting an entry afterwards does not remove its archived line', () => {
    const vault = createEmptyVault()
    const { rent } = planned(vault)
    const snapshot = takeSnapshot(vault, 'Before the delete')

    deleteEntry(vault, rent.id)

    expect(vault.budget.entries).toHaveLength(1)
    expect(vault.budget.plan.some(e => e.entryId === rent.id)).toBe(false)
    // The snapshot keeps both lines: it holds names, not references.
    expect(snapshot.lines).toHaveLength(2)
    expect(snapshot.lines[1].entryName).toBe('Rent')
    expect(snapshot.lines[1].plannedAmount).toBe('1350.00')
  })

  test('editing the plan afterwards does not change the snapshot', () => {
    const vault = createEmptyVault()
    const { rent } = planned(vault)
    const snapshot = takeSnapshot(vault, 'Snapshot')

    setPlanned(vault, rent.id, '1500.00')

    expect(snapshot.lines[1].plannedAmount).toBe('1350.00')
    expect(plannedFor(vault, rent.id)).toBe('1500.00')
  })
})

describe('listSnapshots', () => {
  test('returns an empty array for an empty vault', () => {
    expect(listSnapshots(createEmptyVault())).toEqual([])
  })

  test('returns snapshots newest first', () => {
    const vault = createEmptyVault()
    const first = takeSnapshot(vault, 'First')
    const second = takeSnapshot(vault, 'Second')
    const third = takeSnapshot(vault, 'Third')

    expect(listSnapshots(vault).map(a => a.id)).toEqual([third.id, second.id, first.id])
  })

  test('orders by createdAt, not by insertion', () => {
    const vault = createEmptyVault()
    const older = takeSnapshot(vault, 'Older')
    const newer = takeSnapshot(vault, 'Newer')
    older.createdAt = '2020-01-01T00:00:00.000Z'
    newer.createdAt = '2030-01-01T00:00:00.000Z'

    expect(listSnapshots(vault).map(a => a.name)).toEqual(['Newer', 'Older'])
  })

  test('does not mutate the stored array', () => {
    const vault = createEmptyVault()
    takeSnapshot(vault, 'First')
    takeSnapshot(vault, 'Second')
    const original = [...vault.budget.snapshots]

    listSnapshots(vault)

    expect(vault.budget.snapshots).toEqual(original)
  })
})

describe('renameSnapshot', () => {
  test('renames the snapshot', () => {
    const vault = createEmptyVault()
    const snapshot = takeSnapshot(vault, 'Old name')

    renameSnapshot(vault, snapshot.id, 'New name')

    expect(snapshot.name).toBe('New name')
  })

  test('trims the new name', () => {
    const vault = createEmptyVault()
    const snapshot = takeSnapshot(vault, 'Old name')

    renameSnapshot(vault, snapshot.id, '  Tidy  ')

    expect(snapshot.name).toBe('Tidy')
  })

  test('rejects an empty name, as creation does', () => {
    const vault = createEmptyVault()
    const snapshot = takeSnapshot(vault, 'Keep me')

    expect(() => renameSnapshot(vault, snapshot.id, '   ')).toThrow(/name/)
    expect(snapshot.name).toBe('Keep me')
  })

  test('an unknown id is a no-op', () => {
    const vault = createEmptyVault()
    const snapshot = takeSnapshot(vault, 'Only one')

    expect(() => renameSnapshot(vault, 'no-such-snapshot', 'Whatever')).not.toThrow()
    expect(snapshot.name).toBe('Only one')
  })
})

describe('deleteSnapshot', () => {
  test('removes the snapshot', () => {
    const vault = createEmptyVault()
    const snapshot = takeSnapshot(vault, 'Doomed')

    deleteSnapshot(vault, snapshot.id)

    expect(vault.budget.snapshots).toHaveLength(0)
    expect(listSnapshots(vault)).toEqual([])
  })

  test('leaves the other snapshots and the plan alone', () => {
    const vault = createEmptyVault()
    const entry = createEntry(vault, { name: 'Rent', type: 'expense', categoryName: 'Housing' })
    setPlanned(vault, entry.id, '1350.00')
    const keep = takeSnapshot(vault, 'Keep')
    const drop = takeSnapshot(vault, 'Drop')

    deleteSnapshot(vault, drop.id)

    expect(listSnapshots(vault).map(a => a.id)).toEqual([keep.id])
    expect(plannedFor(vault, entry.id)).toBe('1350.00')
  })

  test('deleting an unknown id is a no-op', () => {
    const vault = createEmptyVault()
    takeSnapshot(vault, 'Keep')

    expect(() => deleteSnapshot(vault, 'no-such-snapshot')).not.toThrow()
    expect(vault.budget.snapshots).toHaveLength(1)
  })
})

describe('seedDefaults', () => {
  test('creates default categories and entries', () => {
    const vault = createEmptyVault()

    seedDefaults(vault)

    expect(vault.budget.categories.length).toBeGreaterThan(0)
    expect(vault.budget.entries.length).toBeGreaterThan(0)
  })

  test('writes the suggested amounts into the plan', () => {
    const vault = createEmptyVault()

    seedDefaults(vault)

    expect(vault.budget.plan.length).toBe(vault.budget.entries.length)
    for (const cat of vault.budget.entries) {
      expect(plannedFor(vault, cat.id)).not.toBe('0.00')
    }
  })

  test('seeds no snapshots — a fresh budget has no history', () => {
    const vault = createEmptyVault()

    seedDefaults(vault)

    expect(vault.budget.snapshots).toEqual([])
  })

  test('does not seed if entries already exist', () => {
    const vault = createEmptyVault()
    createEntry(vault, { name: 'Existing', type: 'income', categoryName: 'Category' })

    seedDefaults(vault)

    expect(vault.budget.entries).toHaveLength(1)
    expect(vault.budget.entries[0].name).toBe('Existing')
  })

  test('creates both income and expense entries', () => {
    const vault = createEmptyVault()

    seedDefaults(vault)

    const incomeCount = vault.budget.entries.filter(c => c.type === 'income').length
    const expenseCount = vault.budget.entries.filter(c => c.type === 'expense').length

    expect(incomeCount).toBeGreaterThan(0)
    expect(expenseCount).toBeGreaterThan(0)
  })

  test('every plan line carries a non-zero amount and nothing else', () => {
    const vault = createEmptyVault()

    seedDefaults(vault)

    for (const entry of vault.budget.plan) {
      expect(Number(entry.plannedAmount)).toBeGreaterThan(0)
      // v4 dropped the actual amount along with the months it belonged to.
      expect(Object.keys(entry).sort()).toEqual(['entryId', 'plannedAmount'])
    }
  })

  test('the seeded plan summarises to the seeded totals', () => {
    const vault = createEmptyVault()

    seedDefaults(vault)
    const summary = getPlanSummary(vault)

    expect(summary.entries).toHaveLength(vault.budget.entries.length)
    expect(summary.totalPlannedIncome).toBe('6000.00')
    // Consumed and gone. Lower than it once was by exactly the two set-asides
    // that used to be mis-typed as expenses: the defaults claimed a household
    // spent its own savings and its own 3a contributions.
    expect(summary.totalPlannedExpenses).toBe('4138.75')
    // Out of the account, still in the net worth: savings, 3a, Serafe and the
    // laptop fund. This total could not be asserted before, because nothing in
    // the seeded data distinguished the four from an expense.
    expect(summary.totalPlannedSavings).toBe('1466.84')
    expect(summary.plannedBalance).toBe('394.41')
  })

  /**
   * The GA is carved out of HABE's transport figure rather than added on top
   * of it, so the household is not shown paying for transport twice. Asserted
   * as a sum, because the point is the total and either number may be
   * restated without breaking it.
   */
  test('the travel pass and what is left of transport still make the survey figure', () => {
    const vault = createEmptyVault()

    seedDefaults(vault)
    const of = (name: string) =>
      Number(plannedFor(vault, vault.budget.entries.find(e => e.name === name)!.id))

    expect(of('Transportation') + of('GA travelcard')).toBeCloseTo(400, 2)
  })

  /**
   * The reported defect: a GA priced at 3'995 a year showed 3'995.04, because
   * the yearly column was twelve times a monthly rounded to the rappen. A bill
   * knows its real total, so a year of it is arithmetic rather than inference.
   */
  test('a year of a bill is its real total, not twelve rounded monthlies', () => {
    const vault = createEmptyVault()

    seedDefaults(vault)
    const summary = getPlanSummary(vault)
    const yearly = (name: string) => summary.entries.find(e => e.entryName === name)!.yearlyAmount

    expect(yearly('GA travelcard')).toBe('3995.00')
    expect(yearly('Serafe')).toBe('335.00')
    // And the purchase, whose cycle is not a year: 1'512 over seven years is
    // 216.00 of laptop per year.
    expect(yearly('Laptop')).toBe('216.00')
  })

  test('an entry with no reserve is still twelve of its monthly', () => {
    const vault = createEmptyVault()

    seedDefaults(vault)
    const summary = getPlanSummary(vault)
    const rent = summary.entries.find(e => e.entryName === 'Rent')!

    expect(rent.yearlyAmount).toBe('16200.00')
  })

  /**
   * The totals are summed from the exact figures rather than multiplied at the
   * end, or the summary bar would disagree with the rows underneath it by a
   * rappen per reserve.
   */
  test('the yearly totals agree with the rows they summarise', () => {
    const vault = createEmptyVault()

    seedDefaults(vault)
    const summary = getPlanSummary(vault)
    const sum = (pick: (t: string) => boolean) =>
      summary.entries
        .filter(e => pick(e.entryType))
        .reduce((total, e) => total + Number(e.yearlyAmount), 0)

    expect(Number(summary.yearlyIncome)).toBeCloseTo(sum(t => t === 'income'), 2)
    expect(Number(summary.yearlySavings)).toBeCloseTo(
      sum(t => t === 'savings' || t === 'bill' || t === 'purchase'),
      2,
    )
    // Twelve times the monthly total would be 4330.08 for the bills alone.
    expect(summary.yearlySavings).not.toBe((Number(summary.totalPlannedSavings) * 12).toFixed(2))
  })

  /**
   * Reported from a screenshot: a category reading 3'995.04 above a single row
   * reading 3'995.00. Every total that a year is shown for has to be summed
   * from the exact figures, not multiplied at the end — the row, the category
   * and the summary bar alike, or two of them disagree in public.
   */
  test('a category of one bill totals exactly that bill', () => {
    const vault = createEmptyVault()

    seedDefaults(vault)
    const summary = getPlanSummary(vault)
    const inLiving = summary.entries.filter(
      e => e.categoryName === 'Living' && e.entryType === 'bill',
    )

    expect(inLiving).toHaveLength(1)
    const total = inLiving.reduce((sum, e) => sum + Number(e.yearlyAmount), 0)
    expect(total.toFixed(2)).toBe('3995.00')
  })

  test('two bills are seeded, so the type does not read as a special case', () => {
    const vault = createEmptyVault()

    seedDefaults(vault)
    const bills = vault.budget.entries.filter(e => e.type === 'bill')

    expect(bills).toHaveLength(2)
    // Serafe sorts first, and the allocations step names it by name.
    expect(bills[0].name).toBe('Serafe')
  })

  test('the defaults exercise every entry type', () => {
    // The reason the two new lines exist: a tour, or anyone reading the
    // starter budget, should meet all five kinds rather than two of them.
    const vault = createEmptyVault()

    seedDefaults(vault)

    const seeded = new Set(vault.budget.entries.map(e => e.type))
    expect([...seeded].sort()).toEqual(['bill', 'expense', 'income', 'purchase', 'savings'])
  })

  test('the seeded bill and purchase carry a reserve that matches their plan', () => {
    const vault = createEmptyVault()

    seedDefaults(vault, 'en', '2026-03')

    for (const entry of vault.budget.entries.filter(e => savesTowardsTarget(e.type))) {
      const reserve = entry.reserve
      expect(reserve, entry.name).toBeDefined()
      expect(reserve!.anchorMonth).toBe('2026-03')
      // The monthly figure has to be able to reach the target within the
      // period, or the line is a schedule that can never meet itself.
      const monthly = Number(plannedFor(vault, entry.id))
      const needed = Number(reserve!.targetAmount) / reserve!.periodMonths
      expect(Math.abs(monthly - needed), entry.name).toBeLessThan(0.01)
    }
  })

  test('the laptop fund is a whole number of francs a month', () => {
    // 1'512 over seven years is exactly 18.00. The odd-looking price is the
    // point: a round monthly figure reads as a decision rather than as
    // arithmetic, and this is the line a tour stops at to explain the type.
    const vault = createEmptyVault()

    seedDefaults(vault)
    const laptop = vault.budget.entries.find(e => e.type === 'purchase')!

    expect(plannedFor(vault, laptop.id)).toBe('18.00')
    expect(laptop.reserve).toEqual({
      targetAmount: '1512.00',
      periodMonths: 84,
      anchorMonth: '2026-01',
    })
  })

  test('is idempotent', () => {
    const vault = createEmptyVault()

    seedDefaults(vault)
    const entriesCount = vault.budget.entries.length
    const categoriesCount = vault.budget.categories.length
    const planCount = vault.budget.plan.length

    seedDefaults(vault)

    expect(vault.budget.entries).toHaveLength(entriesCount)
    expect(vault.budget.categories).toHaveLength(categoriesCount)
    expect(vault.budget.plan).toHaveLength(planCount)
  })

  test('routes every seeded entry to the primary account', () => {
    const vault = createEmptyVault()
    const primary = primaryAccountId(vault)

    seedDefaults(vault)

    expect(vault.budget.entries.length).toBeGreaterThan(0)
    for (const cat of vault.budget.entries) {
      if (cat.type === 'income') {
        expect(cat.sourceAccountId).toBeNull()
        expect(cat.sinkAccountId).toBe(primary)
      } else if (holdsMoney(cat.type)) {
        // Leaves what is spendable without leaving the net worth, so it has
        // both ends: out of the account it is planned against, and into the
        // one holding it. Seeding a bill and a purchase is what first made
        // this branch reachable.
        expect(cat.sourceAccountId, cat.name).toBe(primary)
        expect(cat.sinkAccountId, cat.name).toBe(primary)
      } else {
        expect(cat.sourceAccountId).toBe(primary)
        expect(cat.sinkAccountId).toBeNull()
      }
    }
  })

  test('every seeded entry is legally routed', () => {
    const vault = createEmptyVault()

    seedDefaults(vault)

    for (const cat of vault.budget.entries) {
      expect(isLegalEntryRouting(cat)).toBe(true)
    }
  })
})

describe('createEntry routing defaults', () => {
  test('a new income entry gets source null, sink primary account', () => {
    const vault = createEmptyVault()
    const primary = primaryAccountId(vault)

    const entry = createEntry(vault, { name: 'Salary', type: 'income', categoryName: 'Employment' })

    expect(entry.sourceAccountId).toBeNull()
    expect(entry.sinkAccountId).toBe(primary)
  })

  test('a new expense entry gets source primary account, sink null', () => {
    const vault = createEmptyVault()
    const primary = primaryAccountId(vault)

    const entry = createEntry(vault, { name: 'Rent', type: 'expense', categoryName: 'Housing' })

    expect(entry.sourceAccountId).toBe(primary)
    expect(entry.sinkAccountId).toBeNull()
  })

  test('created entries are legally routed and never carry a reserve', () => {
    const vault = createEmptyVault()

    const income = createEntry(vault, { name: 'Salary', type: 'income', categoryName: 'Employment' })
    const expense = createEntry(vault, { name: 'Rent', type: 'expense', categoryName: 'Housing' })

    expect(isLegalEntryRouting(income)).toBe(true)
    expect(isLegalEntryRouting(expense)).toBe(true)
    expect(income.reserve).toBeUndefined()
    expect(expense.reserve).toBeUndefined()
  })

  test('a new entry is born routed the way its type requires', () => {
    const vault = createEmptyVault()

    const income = createEntry(vault, { name: 'Salary', type: 'income', categoryName: 'Employment' })
    const expense = createEntry(vault, { name: 'Rent', type: 'expense', categoryName: 'Housing' })

    expect(isLegalEntryRouting(income)).toBe(true)
    expect(isLegalEntryRouting(expense)).toBe(true)
    expect(income.sourceAccountId).toBeNull()
    expect(expense.sinkAccountId).toBeNull()
  })

  test('routes to the first account when the vault has several', () => {
    const vault = createEmptyVault()
    vault.accounts.push({
      id: 'second-account',
      name: 'Reserves',
      kind: 'reserves',
      currency: 'CHF',
      currentAmount: '0.00',
      lastCorrectedAt: '2026-01-01',
    })

    const entry = createEntry(vault, { name: 'Rent', type: 'expense', categoryName: 'Housing' })

    expect(entry.sourceAccountId).toBe(vault.accounts[0].id)
  })
})

describe('resetBudget', () => {
  function vaultWithPlan() {
    const vault = createEmptyVault()
    const salary = createEntry(vault, { name: 'Salary', type: 'income', categoryName: 'Employment' })
    const rent = createEntry(vault, { name: 'Rent', type: 'expense', categoryName: 'Housing' })
    setPlanned(vault, salary.id, '6000.00')
    setPlanned(vault, rent.id, '1350.00')
    return { vault, salary, rent }
  }

  test('empties entries, categories and the plan', () => {
    const { vault } = vaultWithPlan()

    resetBudget(vault)

    expect(vault.budget.entries).toEqual([])
    expect(vault.budget.categories).toEqual([])
    expect(vault.budget.plan).toEqual([])
  })

  // Snapshots hold names, not references, so they read the same after the
  // entries they describe are gone. Resetting the plan is not erasing history.
  test('leaves snapshots standing', () => {
    const { vault } = vaultWithPlan()
    const snapshot = takeSnapshot(vault, 'Before the reset')

    resetBudget(vault)

    expect(vault.budget.snapshots).toHaveLength(1)
    expect(vault.budget.snapshots[0].name).toBe('Before the reset')
    expect(snapshot.lines).toEqual([
      { entryName: 'Salary', categoryName: 'Employment', type: 'income', plannedAmount: '6000.00' },
      { entryName: 'Rent', categoryName: 'Housing', type: 'expense', plannedAmount: '1350.00' },
    ])
  })

  test('an already empty budget is unchanged', () => {
    const vault = createEmptyVault()

    expect(() => resetBudget(vault)).not.toThrow()
    expect(vault.budget.entries).toEqual([])
  })

  test('the accounts module is none of its business', () => {
    const { vault } = vaultWithPlan()
    const accountsBefore = structuredClone(vault.accounts)

    resetBudget(vault)

    expect(vault.accounts).toEqual(accountsBefore)
  })
})

describe('updateCategory', () => {
  function vaultWithCategories() {
    const vault = createEmptyVault()
    createEntry(vault, { name: 'Rent', type: 'expense', categoryName: 'Housing' })
    createEntry(vault, { name: 'Utilities', type: 'expense', categoryName: 'Housing' })
    createEntry(vault, { name: 'Salary', type: 'income', categoryName: 'Employment' })
    const housing = listCategories(vault).find(g => g.name === 'Housing')!
    const employment = listCategories(vault).find(g => g.name === 'Employment')!
    return { vault, housing, employment }
  }

  test('renames without disturbing its entries', () => {
    const { vault, housing } = vaultWithCategories()

    updateCategory(vault, housing.id, { name: 'Home' })

    expect(housing.name).toBe('Home')
    expect(entriesInCategory(vault, housing.id).map(c => c.name)).toEqual(['Rent', 'Utilities'])
  })

  test('trims, and refuses a name that is only whitespace', () => {
    const { vault, housing } = vaultWithCategories()

    updateCategory(vault, housing.id, { name: '  Home  ' })
    expect(housing.name).toBe('Home')

    expect(() => updateCategory(vault, housing.id, { name: '   ' })).toThrow(/needs a name/)
    expect(housing.name).toBe('Home')
  })

  // name+type is already a category's identity: getOrCreateCategory matches on the
  // pair, so a rename must not manufacture a duplicate creation would refuse.
  test('refuses a name already taken on the same side', () => {
    const { vault, housing } = vaultWithCategories()
    createEntry(vault, { name: 'Food', type: 'expense', categoryName: 'Living' })

    expect(() => updateCategory(vault, housing.id, { name: 'Living' })).toThrow(/already exists/)
    expect(housing.name).toBe('Housing')
  })

  test('the same name on the other side is not a collision', () => {
    const { vault, housing, employment } = vaultWithCategories()

    // An expense "Employment" and an income "Employment" are different categories.
    expect(findCategoryConflict(vault, housing.id, 'Employment', 'expense')).toBeNull()
    updateCategory(vault, housing.id, { name: 'Employment' })

    expect(housing.name).toBe('Employment')
    expect(employment.name).toBe('Employment')
  })

  test('changing the type carries the entries across', () => {
    const { vault, housing } = vaultWithCategories()

    updateCategory(vault, housing.id, { side: 'income' })

    expect(housing.side).toBe('income')
    // getPlanSummary reads each entry's own type, so leaving them behind
    // would count this category on the wrong side of the budget.
    expect(entriesInCategory(vault, housing.id).every(c => c.type === 'income')).toBe(true)
  })

  test('entries arrive on the other side legally routed', () => {
    const { vault, housing } = vaultWithCategories()

    updateCategory(vault, housing.id, { side: 'income' })

    for (const cat of entriesInCategory(vault, housing.id)) {
      expect(isLegalEntryRouting(cat)).toBe(true)
    }
  })

  test('a reserve does not survive the move to income', () => {
    const { vault, housing } = vaultWithCategories()
    const rent = entriesInCategory(vault, housing.id)[0]
    rent.type = 'bill'
    rent.reserve = { targetAmount: '1200.00', periodMonths: 12, anchorMonth: '2026-01' }

    updateCategory(vault, housing.id, { side: 'income' })

    // Setting money aside towards a target is something only an expense does.
    expect(rent.reserve).toBeUndefined()
  })

  test('renaming and switching type at once still checks the new side', () => {
    const { vault, housing } = vaultWithCategories()

    expect(() => updateCategory(vault, housing.id, { name: 'Employment', side: 'income' })).toThrow(
      /already exists/,
    )
    expect(housing.side).toBe('expense')
    expect(entriesInCategory(vault, housing.id).every(c => c.type === 'expense')).toBe(true)
  })

  test('an unknown category is a no-op', () => {
    const { vault } = vaultWithCategories()
    expect(() => updateCategory(vault, 'no-such-category', { name: 'Whatever' })).not.toThrow()
  })
})

describe('mergeCategory', () => {
  function vaultWithTwo() {
    const vault = createEmptyVault()
    createEntry(vault, { name: 'Rent', type: 'expense', categoryName: 'Housing' })
    createEntry(vault, { name: 'Food', type: 'expense', categoryName: 'Living' })
    const housing = listCategories(vault).find(g => g.name === 'Housing')!
    const living = listCategories(vault).find(g => g.name === 'Living')!
    return { vault, housing, living }
  }

  test('moves the entries across and drops the emptied category', () => {
    const { vault, housing, living } = vaultWithTwo()

    mergeCategory(vault, housing.id, living.id)

    expect(entriesInCategory(vault, living.id).map(c => c.name).sort()).toEqual(['Food', 'Rent'])
    expect(listCategories(vault).map(g => g.name)).toEqual(['Living'])
  })

  test('the plan is untouched — nothing is deleted, only re-filed', () => {
    const { vault, housing, living } = vaultWithTwo()
    const rent = entriesInCategory(vault, housing.id)[0]
    setPlanned(vault, rent.id, '1350.00')

    mergeCategory(vault, housing.id, living.id)

    expect(plannedFor(vault, rent.id)).toBe('1350.00')
  })

  test('crossing sides changes the entries type with it', () => {
    const { vault, housing } = vaultWithTwo()
    createEntry(vault, { name: 'Salary', type: 'income', categoryName: 'Employment' })
    const employment = listCategories(vault).find(g => g.name === 'Employment')!

    mergeCategory(vault, housing.id, employment.id)

    const moved = entriesInCategory(vault, employment.id).find(c => c.name === 'Rent')!
    expect(moved.type).toBe('income')
    expect(isLegalEntryRouting(moved)).toBe(true)
  })

  test('merging a category into itself is a no-op', () => {
    const { vault, housing } = vaultWithTwo()

    mergeCategory(vault, housing.id, housing.id)

    expect(listCategories(vault)).toHaveLength(2)
    expect(entriesInCategory(vault, housing.id)).toHaveLength(1)
  })
})

describe('empty categories do not linger', () => {
  function twoCategories() {
    const vault = createEmptyVault()
    const rent = createEntry(vault, { name: 'Rent', type: 'expense', categoryName: 'Housing' })
    const food = createEntry(vault, { name: 'Food', type: 'expense', categoryName: 'Living' })
    return { vault, rent, food }
  }

  test('deleting the last entry takes its category with it', () => {
    const { vault, rent } = twoCategories()

    deleteEntry(vault, rent.id)

    expect(listCategories(vault).map(g => g.name)).toEqual(['Living'])
  })

  test('a category with entries left is untouched', () => {
    const { vault, rent } = twoCategories()
    createEntry(vault, { name: 'Utilities', type: 'expense', categoryName: 'Housing' })

    deleteEntry(vault, rent.id)

    expect(listCategories(vault).map(g => g.name).sort()).toEqual(['Housing', 'Living'])
  })

  // The bug this exists to prevent: an invisible category is still a name, and the
  // rename dialog would refuse "Housing" while showing the user no such category.
  test('an emptied category stops blocking the name', () => {
    const { vault, rent, food } = twoCategories()

    deleteEntry(vault, rent.id)

    const living = listCategories(vault).find(g => g.name === 'Living')!
    expect(findCategoryConflict(vault, living.id, 'Housing', 'expense')).toBeNull()
    expect(() => updateCategory(vault, living.id, { name: 'Housing' })).not.toThrow()
    expect(listCategories(vault).map(g => g.name)).toEqual(['Housing'])
    expect(entriesInCategory(vault, living.id).map(c => c.id)).toEqual([food.id])
  })

  test('an archived entry still holds its category open', () => {
    const { vault, rent } = twoCategories()
    updateEntry(vault, rent.id, { archived: true })
    const spare = createEntry(vault, { name: 'Utilities', type: 'expense', categoryName: 'Housing' })

    deleteEntry(vault, spare.id)

    // Rent is archived, not gone; unarchiving it should find Housing waiting.
    expect(listCategories(vault).map(g => g.name).sort()).toEqual(['Housing', 'Living'])
  })

  test('seeded defaults survive seeding', () => {
    const vault = createEmptyVault()
    seedDefaults(vault)

    expect(listCategories(vault).length).toBeGreaterThan(1)
    for (const g of listCategories(vault)) {
      expect(entriesInCategory(vault, g.id).length).toBeGreaterThan(0)
    }
  })
})

describe('seedDefaults in another language', () => {
  test('writes the starter budget in the language asked for', () => {
    const vault = createEmptyVault()

    seedDefaults(vault, 'fr')

    expect(listCategories(vault).map(c => c.name)).toContain('Logement')
    expect(listEntries(vault).map(e => e.name)).toContain('Loyer')
    expect(listEntries(vault).map(e => e.name)).toContain('Assurance maladie')
  })

  test('entries land under the category of the same language', () => {
    const vault = createEmptyVault()

    seedDefaults(vault, 'it')

    const housing = listCategories(vault).find(c => c.name === 'Abitazione')!
    expect(entriesInCategory(vault, housing.id).map(e => e.name).sort())
      .toEqual(['Affitto', 'Spese accessorie'])
  })

  test('the amounts are the same whatever the language', () => {
    const en = createEmptyVault()
    const de = createEmptyVault()

    seedDefaults(en, 'en')
    seedDefaults(de, 'de')

    // Only the words differ. The Swiss figures behind them do not.
    expect(de.budget.plan.map(p => p.plannedAmount))
      .toEqual(en.budget.plan.map(p => p.plannedAmount))
    expect(listEntries(de)).toHaveLength(listEntries(en).length)
  })

  test('official Swiss terms keep their names', () => {
    for (const [locale, expected] of [['de', 'Säule 3a'], ['fr', 'Pilier 3a'], ['it', 'Pilastro 3a']] as const) {
      const vault = createEmptyVault()
      seedDefaults(vault, locale)
      expect(listEntries(vault).map(e => e.name)).toContain(expected)
    }
  })

  // Seeding in a language we cannot check would write guessed words into a
  // budget as data, where they persist and get edited rather than corrected.
  test('a language with no seed names falls back to English', () => {
    const vault = createEmptyVault()

    seedDefaults(vault, 'rm')

    expect(listCategories(vault).map(c => c.name)).toContain('Housing')
  })

  test('defaults to English when no language is given', () => {
    const vault = createEmptyVault()

    seedDefaults(vault)

    expect(listCategories(vault).map(c => c.name)).toContain('Housing')
  })

  // The names are the user's once written: nothing re-translates them later.
  test('renaming a seeded entry survives, because it is data', () => {
    const vault = createEmptyVault()
    seedDefaults(vault, 'de')
    const rent = listEntries(vault).find(e => e.name === 'Miete')!

    updateEntry(vault, rent.id, { name: 'Miete WG' })

    expect(listEntries(vault).find(e => e.id === rent.id)!.name).toBe('Miete WG')
  })
})

/**
 * The household example, which the shared-budgets walkthrough puts on screen.
 *
 * Two claims are worth holding here, because both are things a reader is told
 * in as many words and would have no way to check.
 */
describe('a plan that balances exactly', () => {
  /**
   * The bug the household seed found on its first run.
   *
   * Its contributions are worked out from its own outgoings, so it balances to
   * the rappen by construction — and the totals are accumulated as floats, so
   * the subtraction lands a hair below zero and `toFixed(2)` keeps the sign.
   * The screen said the plan was short by minus nothing.
   */
  test('reports zero rather than minus zero', () => {
    const vault = createEmptyVault()
    const income = createEntry(vault, { name: 'In', type: 'income', categoryName: 'A' })
    const a = createEntry(vault, { name: 'A', type: 'expense', categoryName: 'B' })
    const b = createEntry(vault, { name: 'B', type: 'expense', categoryName: 'B' })
    setPlanned(vault, income.id, '2477.60')
    setPlanned(vault, a.id, '2247.84')
    setPlanned(vault, b.id, '229.76')

    const summary = getPlanSummary(vault)

    expect(summary.plannedBalance).toBe('0.00')
    expect(summary.yearlyBalance).toBe('0.00')
  })

  // The sign is only taken off a value that has already rounded to zero.
  test('one rappen short is still one rappen short', () => {
    const vault = createEmptyVault()
    const income = createEntry(vault, { name: 'In', type: 'income', categoryName: 'A' })
    const out = createEntry(vault, { name: 'Out', type: 'expense', categoryName: 'B' })
    setPlanned(vault, income.id, '100.00')
    setPlanned(vault, out.id, '100.01')

    expect(getPlanSummary(vault).plannedBalance).toBe('-0.01')
  })
})

describe('seedSharedDefaults', () => {
  test('the two contributions come to exactly what goes out', () => {
    // The point of the example is a household that is funded, so a figure
    // edited without the others would leave the tour showing a shared budget
    // that does not add up — and nothing else would notice.
    const vault = createEmptyVault()

    seedSharedDefaults(vault)
    const summary = getPlanSummary(vault)

    // Expenses *and* what is only being held: the Serafe reserve and the joint
    // set-aside leave the shared account every month like anything else, and a
    // contribution that covered only `expense` would come up short every year.
    const out = Number(summary.totalPlannedExpenses) + Number(summary.totalPlannedSavings)
    expect(Number(summary.totalPlannedIncome)).toBeCloseTo(out, 2)
    expect(summary.plannedBalance).toBe('0.00')
  })

  test('the split is 60/40, not halves', () => {
    // Equal shares would quietly undo the point of the example — that people
    // who earn differently need not pay the same. Not stated in the copy, so
    // this is the only thing holding it.
    const vault = createEmptyVault()

    seedSharedDefaults(vault)
    const [alex, sam] = listEntries(vault)
      .filter(e => e.type === 'income')
      .map(e => Number(plannedFor(vault, e.id)))

    expect(alex).not.toBe(sam)
    expect(alex / (alex + sam)).toBeCloseTo(0.6, 4)
  })

  test('income arrives as two contributions rather than one salary', () => {
    const vault = createEmptyVault()

    seedSharedDefaults(vault)

    expect(listEntries(vault).filter(e => e.type === 'income')).toHaveLength(2)
  })

  /**
   * Nothing bought by a person rather than by the dwelling.
   *
   * Health insurance is the one the survey would have let us seed — it reports
   * 688.67 a month for this household — and it stays out: the premium is
   * contracted, priced and subsidised per person, so seeding it would decide
   * something that is the couple's to decide. The insurance heading is there
   * for the cover on the home, which is shared by construction.
   */
  test('holds nothing bought by a person rather than by the home', () => {
    const vault = createEmptyVault()

    seedSharedDefaults(vault)
    const names = listEntries(vault).map(e => e.name)

    expect(names).not.toContain('Health Insurance')
    expect(names).not.toContain('Pillar 3a')
    expect(names).not.toContain('GA travelcard')
    expect(names).not.toContain('Clothing & Footwear')
    expect(names).toContain('Household insurance')
  })

  /**
   * That each figure is the survey's, unrounded.
   *
   * Written out rather than derived, because the point is that somebody read
   * them off `je-d-20.02.01.02.13` — a test that recomputed them from the seed
   * would agree with any typo the seed contained.
   */
  test('carries the BFS figures for a couple under 65 without children', () => {
    const vault = createEmptyVault()

    seedSharedDefaults(vault)
    const planned = Object.fromEntries(
      listEntries(vault).map(e => [e.name, plannedFor(vault, e.id)]),
    )

    expect(planned['Rent']).toBe('1238.54')
    expect(planned['Utilities']).toBe('145.12')
    expect(planned['Electricity']).toBe('70.58')
    expect(planned['Heating']).toBe('36.02')
    expect(planned['Food & Groceries']).toBe('715.63')
    expect(planned['Household insurance']).toBe('41.95')
    expect(planned['Inventory reserve']).toBe('201.84')
  })

  // The survey reports 106.59 for energy at the main residence, and the seed
  // shows it as two lines because it arrives on two bills. They have to still
  // add up, or the split has quietly become an estimate.
  test('electricity and heating reconcile with the survey’s energy line', () => {
    const vault = createEmptyVault()

    seedSharedDefaults(vault)
    const at = (name: string) =>
      Number(plannedFor(vault, listEntries(vault).find(e => e.name === name)!.id))

    expect(at('Electricity') + at('Heating')).toBeCloseTo(106.6, 2)
  })

  test('writes a planned amount for every entry', () => {
    const vault = createEmptyVault()

    seedSharedDefaults(vault)

    expect(vault.budget.plan).toHaveLength(vault.budget.entries.length)
    for (const entry of vault.budget.entries) {
      expect(plannedFor(vault, entry.id)).not.toBe('0.00')
    }
  })

  test('is named in the chosen language', () => {
    const vault = createEmptyVault()

    seedSharedDefaults(vault, 'de')

    expect(listCategories(vault).map(c => c.name)).toContain('Beiträge')
  })

  test('does not seed over a budget that already has entries', () => {
    const vault = createEmptyVault()
    createEntry(vault, { name: 'Existing', type: 'income', categoryName: 'Category' })

    seedSharedDefaults(vault)

    expect(vault.budget.entries).toHaveLength(1)
  })
})
