import { describe, test, expect, beforeEach } from 'vitest'
import {
  listGroups,
  createGroup,
  getOrCreateGroup,
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  reorderCategories,
  plannedFor,
  setPlanned,
  getPlanSummary,
  listArchives,
  archivePlan,
  renameArchive,
  deleteArchive,
  seedDefaults,
} from './budgetEngine'
import { createEmptyVault, type VaultData } from '../crypto/vault'
import { isLegalCategoryRouting, isLegalRouting, flowKindOf, primaryAccountId } from '../accounts/routing'

describe('listGroups', () => {
  test('returns empty array for empty vault', () => {
    const vault = createEmptyVault()
    const groups = listGroups(vault)

    expect(groups).toEqual([])
  })

  test('returns groups sorted by sortOrder', () => {
    const vault = createEmptyVault()
    vault.budget.categoryGroups = [
      { id: '3', name: 'Third', type: 'expense', sortOrder: 30 },
      { id: '1', name: 'First', type: 'income', sortOrder: 10 },
      { id: '2', name: 'Second', type: 'expense', sortOrder: 20 },
    ]

    const groups = listGroups(vault)

    expect(groups).toHaveLength(3)
    expect(groups[0].name).toBe('First')
    expect(groups[1].name).toBe('Second')
    expect(groups[2].name).toBe('Third')
  })

  test('handles groups with same sortOrder', () => {
    const vault = createEmptyVault()
    vault.budget.categoryGroups = [
      { id: '1', name: 'A', type: 'income', sortOrder: 10 },
      { id: '2', name: 'B', type: 'expense', sortOrder: 10 },
    ]

    const groups = listGroups(vault)

    expect(groups).toHaveLength(2)
  })

  test('does not mutate original array', () => {
    const vault = createEmptyVault()
    vault.budget.categoryGroups = [
      { id: '2', name: 'Second', type: 'expense', sortOrder: 20 },
      { id: '1', name: 'First', type: 'income', sortOrder: 10 },
    ]

    const originalOrder = [...vault.budget.categoryGroups]
    listGroups(vault)

    expect(vault.budget.categoryGroups).toEqual(originalOrder)
  })

  test('handles negative sortOrder values', () => {
    const vault = createEmptyVault()
    vault.budget.categoryGroups = [
      { id: '1', name: 'Negative', type: 'income', sortOrder: -10 },
      { id: '2', name: 'Zero', type: 'expense', sortOrder: 0 },
      { id: '3', name: 'Positive', type: 'expense', sortOrder: 10 },
    ]

    const groups = listGroups(vault)

    expect(groups[0].name).toBe('Negative')
    expect(groups[1].name).toBe('Zero')
    expect(groups[2].name).toBe('Positive')
  })
})

describe('createGroup', () => {
  test('creates income group successfully', () => {
    const vault = createEmptyVault()
    const group = createGroup(vault, 'Employment', 'income')

    expect(group.name).toBe('Employment')
    expect(group.type).toBe('income')
    expect(group.sortOrder).toBe(10)
    expect(group.id).toBeTruthy()
    expect(vault.budget.categoryGroups).toContain(group)
  })

  test('creates expense group successfully', () => {
    const vault = createEmptyVault()
    const group = createGroup(vault, 'Housing', 'expense')

    expect(group.name).toBe('Housing')
    expect(group.type).toBe('expense')
    expect(group.sortOrder).toBe(10)
  })

  test('creates group with custom sortOrder', () => {
    const vault = createEmptyVault()
    const group = createGroup(vault, 'Custom', 'income', 99)

    expect(group.sortOrder).toBe(99)
  })

  test('auto-increments sortOrder by 10', () => {
    const vault = createEmptyVault()
    const group1 = createGroup(vault, 'First', 'income')
    const group2 = createGroup(vault, 'Second', 'income')
    const group3 = createGroup(vault, 'Third', 'income')

    expect(group1.sortOrder).toBe(10)
    expect(group2.sortOrder).toBe(20)
    expect(group3.sortOrder).toBe(30)
  })

  test('generates unique IDs', () => {
    const vault = createEmptyVault()
    const group1 = createGroup(vault, 'First', 'income')
    const group2 = createGroup(vault, 'Second', 'income')

    expect(group1.id).not.toBe(group2.id)
  })

  test('handles empty name', () => {
    const vault = createEmptyVault()
    const group = createGroup(vault, '', 'income')

    expect(group.name).toBe('')
    expect(vault.budget.categoryGroups).toContain(group)
  })

  test('handles very long name', () => {
    const vault = createEmptyVault()
    const longName = 'A'.repeat(1000)
    const group = createGroup(vault, longName, 'income')

    expect(group.name).toBe(longName)
  })

  test('handles unicode characters in name', () => {
    const vault = createEmptyVault()
    const group = createGroup(vault, '雇用 🏢 Travail', 'income')

    expect(group.name).toBe('雇用 🏢 Travail')
  })

  test('calculates sortOrder from max of existing groups', () => {
    const vault = createEmptyVault()
    vault.budget.categoryGroups = [
      { id: '1', name: 'First', type: 'income', sortOrder: 5 },
      { id: '2', name: 'Second', type: 'expense', sortOrder: 100 },
    ]

    const group = createGroup(vault, 'Third', 'income')

    expect(group.sortOrder).toBe(110) // max(5, 100) + 10
  })

  test('handles zero sortOrder in existing groups', () => {
    const vault = createEmptyVault()
    vault.budget.categoryGroups = [
      { id: '1', name: 'Zero', type: 'income', sortOrder: 0 },
    ]

    const group = createGroup(vault, 'Next', 'income')

    expect(group.sortOrder).toBe(10)
  })

  test('handles negative sortOrder in existing groups', () => {
    const vault = createEmptyVault()
    vault.budget.categoryGroups = [
      { id: '1', name: 'Negative', type: 'income', sortOrder: -50 },
    ]

    const group = createGroup(vault, 'Next', 'income')

    expect(group.sortOrder).toBe(-40)
  })
})

describe('getOrCreateGroup', () => {
  test('returns existing group if found', () => {
    const vault = createEmptyVault()
    const existing = createGroup(vault, 'Employment', 'income')

    const result = getOrCreateGroup(vault, 'Employment', 'income')

    expect(result).toBe(existing)
    expect(vault.budget.categoryGroups).toHaveLength(1)
  })

  test('creates new group if not found', () => {
    const vault = createEmptyVault()

    const result = getOrCreateGroup(vault, 'Employment', 'income')

    expect(result.name).toBe('Employment')
    expect(result.type).toBe('income')
    expect(vault.budget.categoryGroups).toHaveLength(1)
  })

  test('distinguishes between income and expense types', () => {
    const vault = createEmptyVault()
    createGroup(vault, 'Transfer', 'income')

    const result = getOrCreateGroup(vault, 'Transfer', 'expense')

    expect(vault.budget.categoryGroups).toHaveLength(2)
    expect(result.type).toBe('expense')
  })

  test('matches by exact name', () => {
    const vault = createEmptyVault()
    createGroup(vault, 'Housing', 'expense')

    const result = getOrCreateGroup(vault, 'housing', 'expense')

    expect(vault.budget.categoryGroups).toHaveLength(2)
    expect(result.name).toBe('housing')
  })

  test('handles empty name', () => {
    const vault = createEmptyVault()
    const group1 = getOrCreateGroup(vault, '', 'income')
    const group2 = getOrCreateGroup(vault, '', 'income')

    expect(group1).toBe(group2)
    expect(vault.budget.categoryGroups).toHaveLength(1)
  })
})

describe('listCategories', () => {
  test('returns empty array for empty vault', () => {
    const vault = createEmptyVault()
    const categories = listCategories(vault)

    expect(categories).toEqual([])
  })

  test('excludes archived categories by default', () => {
    const vault = createEmptyVault()
    vault.budget.categories = [
      { id: '1', name: 'Active', type: 'income', sortOrder: 10, archived: false, groupId: 'g1', sourceAccountId: null, sinkAccountId: 'acc1' },
      { id: '2', name: 'Archived', type: 'expense', sortOrder: 20, archived: true, groupId: 'g2', sourceAccountId: 'acc1', sinkAccountId: null },
    ]

    const categories = listCategories(vault)

    expect(categories).toHaveLength(1)
    expect(categories[0].name).toBe('Active')
  })

  test('includes archived categories when requested', () => {
    const vault = createEmptyVault()
    vault.budget.categories = [
      { id: '1', name: 'Active', type: 'income', sortOrder: 10, archived: false, groupId: 'g1', sourceAccountId: null, sinkAccountId: 'acc1' },
      { id: '2', name: 'Archived', type: 'expense', sortOrder: 20, archived: true, groupId: 'g2', sourceAccountId: 'acc1', sinkAccountId: null },
    ]

    const categories = listCategories(vault, true)

    expect(categories).toHaveLength(2)
  })

  test('returns categories sorted by sortOrder', () => {
    const vault = createEmptyVault()
    vault.budget.categories = [
      { id: '3', name: 'Third', type: 'expense', sortOrder: 30, archived: false, groupId: 'g1', sourceAccountId: 'acc1', sinkAccountId: null },
      { id: '1', name: 'First', type: 'income', sortOrder: 10, archived: false, groupId: 'g1', sourceAccountId: null, sinkAccountId: 'acc1' },
      { id: '2', name: 'Second', type: 'expense', sortOrder: 20, archived: false, groupId: 'g1', sourceAccountId: 'acc1', sinkAccountId: null },
    ]

    const categories = listCategories(vault)

    expect(categories[0].name).toBe('First')
    expect(categories[1].name).toBe('Second')
    expect(categories[2].name).toBe('Third')
  })

  test('does not mutate original array', () => {
    const vault = createEmptyVault()
    vault.budget.categories = [
      { id: '2', name: 'Second', type: 'expense', sortOrder: 20, archived: false, groupId: 'g1', sourceAccountId: 'acc1', sinkAccountId: null },
      { id: '1', name: 'First', type: 'income', sortOrder: 10, archived: false, groupId: 'g1', sourceAccountId: null, sinkAccountId: 'acc1' },
    ]

    const originalOrder = [...vault.budget.categories]
    listCategories(vault)

    expect(vault.budget.categories).toEqual(originalOrder)
  })
})

describe('createCategory', () => {
  test('creates category successfully', () => {
    const vault = createEmptyVault()
    const category = createCategory(vault, {
      name: 'Salary',
      type: 'income',
      groupName: 'Employment',
    })

    expect(category.name).toBe('Salary')
    expect(category.type).toBe('income')
    expect(category.sortOrder).toBe(10)
    expect(category.archived).toBe(false)
    expect(category.id).toBeTruthy()
    expect(category.groupId).toBeTruthy()
    expect(vault.budget.categories).toContain(category)
  })

  test('creates category with custom sortOrder', () => {
    const vault = createEmptyVault()
    const category = createCategory(vault, {
      name: 'Test',
      type: 'income',
      groupName: 'Group',
      sortOrder: 99,
    })

    expect(category.sortOrder).toBe(99)
  })

  test('auto-increments sortOrder', () => {
    const vault = createEmptyVault()
    const cat1 = createCategory(vault, { name: 'First', type: 'income', groupName: 'Group' })
    const cat2 = createCategory(vault, { name: 'Second', type: 'income', groupName: 'Group' })

    expect(cat1.sortOrder).toBe(10)
    expect(cat2.sortOrder).toBe(20)
  })

  test('creates group if it does not exist', () => {
    const vault = createEmptyVault()
    const category = createCategory(vault, {
      name: 'Salary',
      type: 'income',
      groupName: 'Employment',
    })

    expect(vault.budget.categoryGroups).toHaveLength(1)
    expect(vault.budget.categoryGroups[0].name).toBe('Employment')
    expect(category.groupId).toBe(vault.budget.categoryGroups[0].id)
  })

  test('reuses existing group', () => {
    const vault = createEmptyVault()
    const group = createGroup(vault, 'Employment', 'income')

    const category = createCategory(vault, {
      name: 'Salary',
      type: 'income',
      groupName: 'Employment',
    })

    expect(vault.budget.categoryGroups).toHaveLength(1)
    expect(category.groupId).toBe(group.id)
  })

  test('generates unique IDs', () => {
    const vault = createEmptyVault()
    const cat1 = createCategory(vault, { name: 'First', type: 'income', groupName: 'Group' })
    const cat2 = createCategory(vault, { name: 'Second', type: 'income', groupName: 'Group' })

    expect(cat1.id).not.toBe(cat2.id)
  })

  test('handles empty name', () => {
    const vault = createEmptyVault()
    const category = createCategory(vault, { name: '', type: 'income', groupName: 'Group' })

    expect(category.name).toBe('')
  })

  test('handles unicode characters', () => {
    const vault = createEmptyVault()
    const category = createCategory(vault, { name: '給料 💰', type: 'income', groupName: '雇用' })

    expect(category.name).toBe('給料 💰')
    expect(vault.budget.categoryGroups[0].name).toBe('雇用')
  })
})

describe('updateCategory — routing stays legal across a type change', () => {
  test('flipping income to expense re-derives routing instead of leaving a contradiction', () => {
    const vault = createEmptyVault()
    const primary = vault.accounts[0].id
    const category = createCategory(vault, { name: 'Salary', type: 'income', groupName: 'Work' })
    expect(category.sourceAccountId).toBe(null)
    expect(category.sinkAccountId).toBe(primary)

    const updated = updateCategory(vault, category.id, { type: 'expense' })

    // Keeping (null, primary) would be an illegal expense row.
    expect(updated?.sourceAccountId).toBe(primary)
    expect(updated?.sinkAccountId).toBe(null)
    expect(isLegalRouting('expense', updated!.sourceAccountId, updated!.sinkAccountId)).toBe(true)
  })

  test('flipping expense to income re-derives routing', () => {
    const vault = createEmptyVault()
    const primary = vault.accounts[0].id
    const category = createCategory(vault, { name: 'Rent', type: 'expense', groupName: 'Housing' })

    const updated = updateCategory(vault, category.id, { type: 'income' })

    expect(updated?.sourceAccountId).toBe(null)
    expect(updated?.sinkAccountId).toBe(primary)
    expect(isLegalRouting('income', updated!.sourceAccountId, updated!.sinkAccountId)).toBe(true)
  })

  test('a reserve cannot survive a move to income', () => {
    const vault = createEmptyVault()
    const primary = vault.accounts[0].id
    const category = createCategory(vault, { name: 'Taxes', type: 'expense', groupName: 'Tax' })
    category.sinkAccountId = primary
    category.reserve = {
      kind: 'obligation',
      targetAmount: '10000.00',
      periodMonths: 12,
      anchorMonth: '2026-09',
    }

    const updated = updateCategory(vault, category.id, { type: 'income' })

    expect(updated?.reserve).toBeUndefined()
  })

  test('routing is untouched when the type is set to its current value', () => {
    const vault = createEmptyVault()
    const category = createCategory(vault, { name: 'Groceries', type: 'expense', groupName: 'Living' })
    category.sinkAccountId = vault.accounts[0].id // hand-routed as a set-aside

    updateCategory(vault, category.id, { type: 'expense', name: 'Food' })

    expect(category.sinkAccountId).toBe(vault.accounts[0].id)
    expect(category.name).toBe('Food')
  })
})

describe('updateCategory', () => {
  test('updates category name', () => {
    const vault = createEmptyVault()
    const category = createCategory(vault, { name: 'Old Name', type: 'income', groupName: 'Group' })

    const updated = updateCategory(vault, category.id, { name: 'New Name' })

    expect(updated?.name).toBe('New Name')
    expect(vault.budget.categories[0].name).toBe('New Name')
  })

  test('updates category type', () => {
    const vault = createEmptyVault()
    const category = createCategory(vault, { name: 'Test', type: 'income', groupName: 'Group' })

    const updated = updateCategory(vault, category.id, { type: 'expense' })

    expect(updated?.type).toBe('expense')
  })

  test('updates sortOrder', () => {
    const vault = createEmptyVault()
    const category = createCategory(vault, { name: 'Test', type: 'income', groupName: 'Group' })

    const updated = updateCategory(vault, category.id, { sortOrder: 99 })

    expect(updated?.sortOrder).toBe(99)
  })

  test('archives category', () => {
    const vault = createEmptyVault()
    const category = createCategory(vault, { name: 'Test', type: 'income', groupName: 'Group' })

    const updated = updateCategory(vault, category.id, { archived: true })

    expect(updated?.archived).toBe(true)
  })

  test('unarchives category', () => {
    const vault = createEmptyVault()
    const category = createCategory(vault, { name: 'Test', type: 'income', groupName: 'Group' })
    vault.budget.categories[0].archived = true

    const updated = updateCategory(vault, category.id, { archived: false })

    expect(updated?.archived).toBe(false)
  })

  test('updates groupName by creating new group', () => {
    const vault = createEmptyVault()
    const category = createCategory(vault, { name: 'Test', type: 'income', groupName: 'Old Group' })

    const updated = updateCategory(vault, category.id, { groupName: 'New Group' })

    expect(vault.budget.categoryGroups).toHaveLength(2)
    expect(updated?.groupId).toBe(vault.budget.categoryGroups[1].id)
  })

  test('updates groupName by reusing existing group', () => {
    const vault = createEmptyVault()
    const group1 = createGroup(vault, 'Group 1', 'income')
    const group2 = createGroup(vault, 'Group 2', 'income')
    const category = createCategory(vault, { name: 'Test', type: 'income', groupName: 'Group 1' })

    const updated = updateCategory(vault, category.id, { groupName: 'Group 2' })

    expect(updated?.groupId).toBe(group2.id)
    expect(vault.budget.categoryGroups).toHaveLength(2)
  })

  test('returns null for non-existent category', () => {
    const vault = createEmptyVault()

    const updated = updateCategory(vault, 'non-existent', { name: 'New Name' })

    expect(updated).toBeNull()
  })

  test('updates multiple fields at once', () => {
    const vault = createEmptyVault()
    const category = createCategory(vault, { name: 'Test', type: 'income', groupName: 'Group' })

    const updated = updateCategory(vault, category.id, {
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
    const category = createCategory(vault, { name: 'Test', type: 'income', groupName: 'Group' })
    const originalName = category.name

    const updated = updateCategory(vault, category.id, {})

    expect(updated?.name).toBe(originalName)
  })
})

describe('deleteCategory', () => {
  test('removes category from vault', () => {
    const vault = createEmptyVault()
    const category = createCategory(vault, { name: 'Test', type: 'income', groupName: 'Group' })

    deleteCategory(vault, category.id)

    expect(vault.budget.categories).toHaveLength(0)
  })

  test('removes the deleted category’s line from the plan', () => {
    const vault = createEmptyVault()
    const category = createCategory(vault, { name: 'Test', type: 'income', groupName: 'Group' })
    setPlanned(vault, category.id, '100.00')

    deleteCategory(vault, category.id)

    expect(vault.budget.plan).toHaveLength(0)
  })

  test('does not affect plan lines for other categories', () => {
    const vault = createEmptyVault()
    const cat1 = createCategory(vault, { name: 'Cat1', type: 'income', groupName: 'Group' })
    const cat2 = createCategory(vault, { name: 'Cat2', type: 'income', groupName: 'Group' })
    setPlanned(vault, cat1.id, '100.00')
    setPlanned(vault, cat2.id, '200.00')

    deleteCategory(vault, cat1.id)

    expect(vault.budget.plan).toHaveLength(1)
    expect(vault.budget.plan[0].categoryId).toBe(cat2.id)
  })

  test('handles deleting non-existent category', () => {
    const vault = createEmptyVault()

    expect(() => deleteCategory(vault, 'non-existent')).not.toThrow()
    expect(vault.budget.categories).toHaveLength(0)
  })

  test('handles empty vault', () => {
    const vault = createEmptyVault()

    expect(() => deleteCategory(vault, 'any-id')).not.toThrow()
  })
})

describe('reorderCategories', () => {
  test('updates sortOrder for all categories', () => {
    const vault = createEmptyVault()
    const cat1 = createCategory(vault, { name: 'First', type: 'income', groupName: 'Group' })
    const cat2 = createCategory(vault, { name: 'Second', type: 'income', groupName: 'Group' })
    const cat3 = createCategory(vault, { name: 'Third', type: 'income', groupName: 'Group' })

    reorderCategories(vault, [cat3.id, cat1.id, cat2.id])

    expect(vault.budget.categories.find(c => c.id === cat3.id)?.sortOrder).toBe(10)
    expect(vault.budget.categories.find(c => c.id === cat1.id)?.sortOrder).toBe(20)
    expect(vault.budget.categories.find(c => c.id === cat2.id)?.sortOrder).toBe(30)
  })

  test('handles empty array', () => {
    const vault = createEmptyVault()
    createCategory(vault, { name: 'Test', type: 'income', groupName: 'Group' })

    expect(() => reorderCategories(vault, [])).not.toThrow()
  })

  test('handles non-existent category IDs', () => {
    const vault = createEmptyVault()
    const cat = createCategory(vault, { name: 'Test', type: 'income', groupName: 'Group' })

    reorderCategories(vault, ['non-existent', cat.id])

    // Only the existing category should be reordered
    expect(vault.budget.categories.find(c => c.id === cat.id)?.sortOrder).toBe(20)
  })

  test('handles single category', () => {
    const vault = createEmptyVault()
    const cat = createCategory(vault, { name: 'Test', type: 'income', groupName: 'Group' })

    reorderCategories(vault, [cat.id])

    expect(vault.budget.categories.find(c => c.id === cat.id)?.sortOrder).toBe(10)
  })
})

describe('plannedFor and setPlanned', () => {
  test('a category with no plan line reads 0.00', () => {
    const vault = createEmptyVault()
    const category = createCategory(vault, { name: 'Rent', type: 'expense', groupName: 'Housing' })

    expect(plannedFor(vault, category.id)).toBe('0.00')
    expect(vault.budget.plan).toHaveLength(0)
  })

  test('an unknown category reads 0.00 rather than throwing', () => {
    const vault = createEmptyVault()

    expect(plannedFor(vault, 'no-such-category')).toBe('0.00')
  })

  test('setPlanned creates the line', () => {
    const vault = createEmptyVault()
    const category = createCategory(vault, { name: 'Rent', type: 'expense', groupName: 'Housing' })

    setPlanned(vault, category.id, '1350.00')

    expect(vault.budget.plan).toEqual([{ categoryId: category.id, plannedAmount: '1350.00' }])
    expect(plannedFor(vault, category.id)).toBe('1350.00')
  })

  test('setPlanned updates in place instead of adding a second line', () => {
    const vault = createEmptyVault()
    const category = createCategory(vault, { name: 'Rent', type: 'expense', groupName: 'Housing' })

    setPlanned(vault, category.id, '1350.00')
    setPlanned(vault, category.id, '1400.00')

    expect(vault.budget.plan).toHaveLength(1)
    expect(plannedFor(vault, category.id)).toBe('1400.00')
  })

  test('the amount stays the exact decimal string it was given', () => {
    const vault = createEmptyVault()
    const category = createCategory(vault, { name: 'Odd', type: 'expense', groupName: 'Living' })

    // Money never becomes a number on the way through: 1234.50 must not come
    // back as 1234.5, and a large amount must not pick up floating-point noise.
    setPlanned(vault, category.id, '1234.50')
    expect(plannedFor(vault, category.id)).toBe('1234.50')

    setPlanned(vault, category.id, '999999999.99')
    expect(plannedFor(vault, category.id)).toBe('999999999.99')

    setPlanned(vault, category.id, '-100.00')
    expect(plannedFor(vault, category.id)).toBe('-100.00')

    setPlanned(vault, category.id, '')
    expect(plannedFor(vault, category.id)).toBe('')
  })

  test('each category has its own line', () => {
    const vault = createEmptyVault()
    const rent = createCategory(vault, { name: 'Rent', type: 'expense', groupName: 'Housing' })
    const food = createCategory(vault, { name: 'Food', type: 'expense', groupName: 'Living' })

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
    const income = createCategory(vault, { name: 'Salary', type: 'income', groupName: 'Employment' })
    const expense1 = createCategory(vault, { name: 'Rent', type: 'expense', groupName: 'Housing' })
    const expense2 = createCategory(vault, { name: 'Food', type: 'expense', groupName: 'Living' })

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
    const income = createCategory(vault, { name: 'Salary', type: 'income', groupName: 'Employment' })
    const expense = createCategory(vault, { name: 'Everything', type: 'expense', groupName: 'Living' })

    setPlanned(vault, income.id, '6000.00')
    setPlanned(vault, expense.id, '6000.00')

    // The zero-based reading the budget is built around: nothing left unassigned.
    expect(getPlanSummary(vault).plannedBalance).toBe('0.00')
  })

  test('shows every category, including those with no plan line', () => {
    const vault = createEmptyVault()
    createCategory(vault, { name: 'Salary', type: 'income', groupName: 'Employment' })
    createCategory(vault, { name: 'Rent', type: 'expense', groupName: 'Housing' })

    const summary = getPlanSummary(vault)

    expect(summary.entries).toHaveLength(2)
    expect(summary.entries[0].plannedAmount).toBe('0.00')
    expect(summary.entries[1].plannedAmount).toBe('0.00')
  })

  test('excludes archived categories', () => {
    const vault = createEmptyVault()
    const active = createCategory(vault, { name: 'Active', type: 'income', groupName: 'Group' })
    const archived = createCategory(vault, { name: 'Archived', type: 'income', groupName: 'Group' })
    setPlanned(vault, archived.id, '999.00')
    updateCategory(vault, archived.id, { archived: true })

    const summary = getPlanSummary(vault)

    expect(summary.entries).toHaveLength(1)
    expect(summary.entries[0].categoryId).toBe(active.id)
    // An archived category's amount must not leak into the totals either.
    expect(summary.totalPlannedIncome).toBe('0.00')
  })

  test('keeps the category sort order', () => {
    const vault = createEmptyVault()
    const third = createCategory(vault, { name: 'Third', type: 'expense', groupName: 'G', sortOrder: 30 })
    const first = createCategory(vault, { name: 'First', type: 'expense', groupName: 'G', sortOrder: 10 })
    const second = createCategory(vault, { name: 'Second', type: 'expense', groupName: 'G', sortOrder: 20 })

    const summary = getPlanSummary(vault)

    expect(summary.entries.map(e => e.categoryId)).toEqual([first.id, second.id, third.id])
  })

  test('handles a negative balance', () => {
    const vault = createEmptyVault()
    const income = createCategory(vault, { name: 'Salary', type: 'income', groupName: 'Employment' })
    const expense = createCategory(vault, { name: 'Rent', type: 'expense', groupName: 'Housing' })

    setPlanned(vault, income.id, '1000.00')
    setPlanned(vault, expense.id, '2000.00')

    expect(getPlanSummary(vault).plannedBalance).toBe('-1000.00')
  })

  test('handles decimal precision', () => {
    const vault = createEmptyVault()
    const income = createCategory(vault, { name: 'Salary', type: 'income', groupName: 'Employment' })
    setPlanned(vault, income.id, '1234.56')

    expect(getPlanSummary(vault).totalPlannedIncome).toBe('1234.56')
  })

  test('includes category metadata in entries', () => {
    const vault = createEmptyVault()
    const group = createGroup(vault, 'Employment', 'income')
    const category = createCategory(vault, {
      name: 'Salary',
      type: 'income',
      groupName: 'Employment',
    })

    const summary = getPlanSummary(vault)

    expect(summary.entries[0].categoryId).toBe(category.id)
    expect(summary.entries[0].categoryName).toBe('Salary')
    expect(summary.entries[0].categoryType).toBe('income')
    expect(summary.entries[0].categoryGroupId).toBe(group.id)
    expect(summary.entries[0].categoryGroupName).toBe('Employment')
  })

  test('handles a category with a missing group', () => {
    const vault = createEmptyVault()
    vault.budget.categories = [
      { id: 'cat1', name: 'Test', type: 'income', sortOrder: 10, archived: false, groupId: 'missing-group', sourceAccountId: null, sinkAccountId: 'acc1' },
    ]

    expect(getPlanSummary(vault).entries[0].categoryGroupName).toBe('')
  })
})

describe('archivePlan', () => {
  function planned(vault: VaultData) {
    const salary = createCategory(vault, { name: 'Salary', type: 'income', groupName: 'Employment' })
    const rent = createCategory(vault, { name: 'Rent', type: 'expense', groupName: 'Housing' })
    setPlanned(vault, salary.id, '6000.00')
    setPlanned(vault, rent.id, '1350.00')
    return { salary, rent }
  }

  test('snapshots the plan as names and amounts', () => {
    const vault = createEmptyVault()
    planned(vault)

    const archive = archivePlan(vault, '2026 baseline')

    expect(archive.name).toBe('2026 baseline')
    expect(archive.id).toBeTruthy()
    expect(archive.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(archive.lines).toEqual([
      { categoryName: 'Salary', groupName: 'Employment', type: 'income', plannedAmount: '6000.00' },
      { categoryName: 'Rent', groupName: 'Housing', type: 'expense', plannedAmount: '1350.00' },
    ])
    expect(vault.budget.archives).toContain(archive)
  })

  test('includes categories left at 0.00, so the archive reads like the plan did', () => {
    const vault = createEmptyVault()
    createCategory(vault, { name: 'Holidays', type: 'expense', groupName: 'Lifestyle' })

    const archive = archivePlan(vault, 'Empty start')

    expect(archive.lines).toHaveLength(1)
    expect(archive.lines[0].plannedAmount).toBe('0.00')
  })

  test('does not snapshot archived categories', () => {
    const vault = createEmptyVault()
    const { rent } = planned(vault)
    updateCategory(vault, rent.id, { archived: true })

    const archive = archivePlan(vault, 'After archiving Rent')

    expect(archive.lines.map(l => l.categoryName)).toEqual(['Salary'])
  })

  test('rejects an empty or whitespace-only name', () => {
    const vault = createEmptyVault()
    planned(vault)

    expect(() => archivePlan(vault, '')).toThrow(/name/)
    expect(() => archivePlan(vault, '   ')).toThrow(/name/)
    expect(() => archivePlan(vault, '\t\n')).toThrow(/name/)
    // A rejected archive must not be half-stored.
    expect(vault.budget.archives).toHaveLength(0)
  })

  test('trims the name', () => {
    const vault = createEmptyVault()

    expect(archivePlan(vault, '  March review  ').name).toBe('March review')
  })

  test('renaming a category afterwards does not rewrite the archive', () => {
    const vault = createEmptyVault()
    const { rent } = planned(vault)
    const archive = archivePlan(vault, 'Before the rename')

    updateCategory(vault, rent.id, { name: 'Rent (new flat)', groupName: 'Accommodation' })

    // The archive records what the plan said at the time. A later rename is a
    // fact about today's budget, not about the snapshot.
    expect(archive.lines[1].categoryName).toBe('Rent')
    expect(archive.lines[1].groupName).toBe('Housing')
    expect(listArchives(vault)[0].lines[1].categoryName).toBe('Rent')
  })

  test('deleting a category afterwards does not remove its archived line', () => {
    const vault = createEmptyVault()
    const { rent } = planned(vault)
    const archive = archivePlan(vault, 'Before the delete')

    deleteCategory(vault, rent.id)

    expect(vault.budget.categories).toHaveLength(1)
    expect(vault.budget.plan.some(e => e.categoryId === rent.id)).toBe(false)
    // The snapshot keeps both lines: it holds names, not references.
    expect(archive.lines).toHaveLength(2)
    expect(archive.lines[1].categoryName).toBe('Rent')
    expect(archive.lines[1].plannedAmount).toBe('1350.00')
  })

  test('editing the plan afterwards does not change the archive', () => {
    const vault = createEmptyVault()
    const { rent } = planned(vault)
    const archive = archivePlan(vault, 'Snapshot')

    setPlanned(vault, rent.id, '1500.00')

    expect(archive.lines[1].plannedAmount).toBe('1350.00')
    expect(plannedFor(vault, rent.id)).toBe('1500.00')
  })
})

describe('listArchives', () => {
  test('returns an empty array for an empty vault', () => {
    expect(listArchives(createEmptyVault())).toEqual([])
  })

  test('returns archives newest first', () => {
    const vault = createEmptyVault()
    const first = archivePlan(vault, 'First')
    const second = archivePlan(vault, 'Second')
    const third = archivePlan(vault, 'Third')

    expect(listArchives(vault).map(a => a.id)).toEqual([third.id, second.id, first.id])
  })

  test('orders by createdAt, not by insertion', () => {
    const vault = createEmptyVault()
    const older = archivePlan(vault, 'Older')
    const newer = archivePlan(vault, 'Newer')
    older.createdAt = '2020-01-01T00:00:00.000Z'
    newer.createdAt = '2030-01-01T00:00:00.000Z'

    expect(listArchives(vault).map(a => a.name)).toEqual(['Newer', 'Older'])
  })

  test('does not mutate the stored array', () => {
    const vault = createEmptyVault()
    archivePlan(vault, 'First')
    archivePlan(vault, 'Second')
    const original = [...vault.budget.archives]

    listArchives(vault)

    expect(vault.budget.archives).toEqual(original)
  })
})

describe('renameArchive', () => {
  test('renames the archive', () => {
    const vault = createEmptyVault()
    const archive = archivePlan(vault, 'Old name')

    renameArchive(vault, archive.id, 'New name')

    expect(archive.name).toBe('New name')
  })

  test('trims the new name', () => {
    const vault = createEmptyVault()
    const archive = archivePlan(vault, 'Old name')

    renameArchive(vault, archive.id, '  Tidy  ')

    expect(archive.name).toBe('Tidy')
  })

  test('rejects an empty name, as creation does', () => {
    const vault = createEmptyVault()
    const archive = archivePlan(vault, 'Keep me')

    expect(() => renameArchive(vault, archive.id, '   ')).toThrow(/name/)
    expect(archive.name).toBe('Keep me')
  })

  test('an unknown id is a no-op', () => {
    const vault = createEmptyVault()
    const archive = archivePlan(vault, 'Only one')

    expect(() => renameArchive(vault, 'no-such-archive', 'Whatever')).not.toThrow()
    expect(archive.name).toBe('Only one')
  })
})

describe('deleteArchive', () => {
  test('removes the archive', () => {
    const vault = createEmptyVault()
    const archive = archivePlan(vault, 'Doomed')

    deleteArchive(vault, archive.id)

    expect(vault.budget.archives).toHaveLength(0)
    expect(listArchives(vault)).toEqual([])
  })

  test('leaves the other archives and the plan alone', () => {
    const vault = createEmptyVault()
    const category = createCategory(vault, { name: 'Rent', type: 'expense', groupName: 'Housing' })
    setPlanned(vault, category.id, '1350.00')
    const keep = archivePlan(vault, 'Keep')
    const drop = archivePlan(vault, 'Drop')

    deleteArchive(vault, drop.id)

    expect(listArchives(vault).map(a => a.id)).toEqual([keep.id])
    expect(plannedFor(vault, category.id)).toBe('1350.00')
  })

  test('deleting an unknown id is a no-op', () => {
    const vault = createEmptyVault()
    archivePlan(vault, 'Keep')

    expect(() => deleteArchive(vault, 'no-such-archive')).not.toThrow()
    expect(vault.budget.archives).toHaveLength(1)
  })
})

describe('seedDefaults', () => {
  test('creates default groups and categories', () => {
    const vault = createEmptyVault()

    seedDefaults(vault)

    expect(vault.budget.categoryGroups.length).toBeGreaterThan(0)
    expect(vault.budget.categories.length).toBeGreaterThan(0)
  })

  test('writes the suggested amounts into the plan', () => {
    const vault = createEmptyVault()

    seedDefaults(vault)

    expect(vault.budget.plan.length).toBe(vault.budget.categories.length)
    for (const cat of vault.budget.categories) {
      expect(plannedFor(vault, cat.id)).not.toBe('0.00')
    }
  })

  test('seeds no archives — a fresh budget has no history', () => {
    const vault = createEmptyVault()

    seedDefaults(vault)

    expect(vault.budget.archives).toEqual([])
  })

  test('does not seed if categories already exist', () => {
    const vault = createEmptyVault()
    createCategory(vault, { name: 'Existing', type: 'income', groupName: 'Group' })

    seedDefaults(vault)

    expect(vault.budget.categories).toHaveLength(1)
    expect(vault.budget.categories[0].name).toBe('Existing')
  })

  test('creates both income and expense categories', () => {
    const vault = createEmptyVault()

    seedDefaults(vault)

    const incomeCount = vault.budget.categories.filter(c => c.type === 'income').length
    const expenseCount = vault.budget.categories.filter(c => c.type === 'expense').length

    expect(incomeCount).toBeGreaterThan(0)
    expect(expenseCount).toBeGreaterThan(0)
  })

  test('every plan line carries a non-zero amount and nothing else', () => {
    const vault = createEmptyVault()

    seedDefaults(vault)

    for (const entry of vault.budget.plan) {
      expect(Number(entry.plannedAmount)).toBeGreaterThan(0)
      // v4 dropped the actual amount along with the months it belonged to.
      expect(Object.keys(entry).sort()).toEqual(['categoryId', 'plannedAmount'])
    }
  })

  test('the seeded plan summarises to the seeded totals', () => {
    const vault = createEmptyVault()

    seedDefaults(vault)
    const summary = getPlanSummary(vault)

    expect(summary.entries).toHaveLength(vault.budget.categories.length)
    expect(summary.totalPlannedIncome).toBe('6000.00')
    expect(summary.totalPlannedExpenses).toBe('5559.67')
    expect(summary.plannedBalance).toBe('440.33')
  })

  test('is idempotent', () => {
    const vault = createEmptyVault()

    seedDefaults(vault)
    const categoriesCount = vault.budget.categories.length
    const groupsCount = vault.budget.categoryGroups.length
    const planCount = vault.budget.plan.length

    seedDefaults(vault)

    expect(vault.budget.categories).toHaveLength(categoriesCount)
    expect(vault.budget.categoryGroups).toHaveLength(groupsCount)
    expect(vault.budget.plan).toHaveLength(planCount)
  })

  test('routes every seeded category to the primary account', () => {
    const vault = createEmptyVault()
    const primary = primaryAccountId(vault)

    seedDefaults(vault)

    expect(vault.budget.categories.length).toBeGreaterThan(0)
    for (const cat of vault.budget.categories) {
      if (cat.type === 'income') {
        expect(cat.sourceAccountId).toBeNull()
        expect(cat.sinkAccountId).toBe(primary)
      } else {
        expect(cat.sourceAccountId).toBe(primary)
        expect(cat.sinkAccountId).toBeNull()
      }
    }
  })

  test('every seeded category is legally routed', () => {
    const vault = createEmptyVault()

    seedDefaults(vault)

    for (const cat of vault.budget.categories) {
      expect(isLegalCategoryRouting(cat)).toBe(true)
    }
  })
})

describe('createCategory routing defaults', () => {
  test('a new income category gets source null, sink primary account', () => {
    const vault = createEmptyVault()
    const primary = primaryAccountId(vault)

    const category = createCategory(vault, { name: 'Salary', type: 'income', groupName: 'Employment' })

    expect(category.sourceAccountId).toBeNull()
    expect(category.sinkAccountId).toBe(primary)
  })

  test('a new expense category gets source primary account, sink null', () => {
    const vault = createEmptyVault()
    const primary = primaryAccountId(vault)

    const category = createCategory(vault, { name: 'Rent', type: 'expense', groupName: 'Housing' })

    expect(category.sourceAccountId).toBe(primary)
    expect(category.sinkAccountId).toBeNull()
  })

  test('created categories are legally routed and never carry a reserve', () => {
    const vault = createEmptyVault()

    const income = createCategory(vault, { name: 'Salary', type: 'income', groupName: 'Employment' })
    const expense = createCategory(vault, { name: 'Rent', type: 'expense', groupName: 'Housing' })

    expect(isLegalCategoryRouting(income)).toBe(true)
    expect(isLegalCategoryRouting(expense)).toBe(true)
    expect(income.reserve).toBeUndefined()
    expect(expense.reserve).toBeUndefined()
  })

  test('defaults classify as income and spending', () => {
    const vault = createEmptyVault()

    const income = createCategory(vault, { name: 'Salary', type: 'income', groupName: 'Employment' })
    const expense = createCategory(vault, { name: 'Rent', type: 'expense', groupName: 'Housing' })

    expect(flowKindOf(income)).toBe('income')
    expect(flowKindOf(expense)).toBe('spending')
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

    const category = createCategory(vault, { name: 'Rent', type: 'expense', groupName: 'Housing' })

    expect(category.sourceAccountId).toBe(vault.accounts[0].id)
  })
})
