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
  listPeriods,
  getPeriod,
  createPeriod,
  copyPeriod,
  getPeriodSummary,
  upsertEntry,
  deleteEntry,
  seedDefaults,
  type PeriodSummary,
  type PeriodEntryView,
} from './budgetEngine'
import { createEmptyVault, type VaultData, type VaultCategoryGroup, type VaultCategory } from '../crypto/vault'

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
      { id: '1', name: 'Active', type: 'income', sortOrder: 10, archived: false, groupId: 'g1', fixed: false },
      { id: '2', name: 'Archived', type: 'expense', sortOrder: 20, archived: true, groupId: 'g2', fixed: false },
    ]

    const categories = listCategories(vault)

    expect(categories).toHaveLength(1)
    expect(categories[0].name).toBe('Active')
  })

  test('includes archived categories when requested', () => {
    const vault = createEmptyVault()
    vault.budget.categories = [
      { id: '1', name: 'Active', type: 'income', sortOrder: 10, archived: false, groupId: 'g1', fixed: false },
      { id: '2', name: 'Archived', type: 'expense', sortOrder: 20, archived: true, groupId: 'g2', fixed: false },
    ]

    const categories = listCategories(vault, true)

    expect(categories).toHaveLength(2)
  })

  test('returns categories sorted by sortOrder', () => {
    const vault = createEmptyVault()
    vault.budget.categories = [
      { id: '3', name: 'Third', type: 'expense', sortOrder: 30, archived: false, groupId: 'g1', fixed: false },
      { id: '1', name: 'First', type: 'income', sortOrder: 10, archived: false, groupId: 'g1', fixed: false },
      { id: '2', name: 'Second', type: 'expense', sortOrder: 20, archived: false, groupId: 'g1', fixed: false },
    ]

    const categories = listCategories(vault)

    expect(categories[0].name).toBe('First')
    expect(categories[1].name).toBe('Second')
    expect(categories[2].name).toBe('Third')
  })

  test('does not mutate original array', () => {
    const vault = createEmptyVault()
    vault.budget.categories = [
      { id: '2', name: 'Second', type: 'expense', sortOrder: 20, archived: false, groupId: 'g1', fixed: false },
      { id: '1', name: 'First', type: 'income', sortOrder: 10, archived: false, groupId: 'g1', fixed: false },
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
    expect(category.fixed).toBe(false)
    expect(category.id).toBeTruthy()
    expect(category.groupId).toBeTruthy()
    expect(vault.budget.categories).toContain(category)
  })

  test('creates fixed category', () => {
    const vault = createEmptyVault()
    const category = createCategory(vault, {
      name: 'Rent',
      type: 'expense',
      groupName: 'Housing',
      fixed: true,
    })

    expect(category.fixed).toBe(true)
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

  test('updates fixed flag', () => {
    const vault = createEmptyVault()
    const category = createCategory(vault, { name: 'Test', type: 'income', groupName: 'Group' })

    const updated = updateCategory(vault, category.id, { fixed: true })

    expect(updated?.fixed).toBe(true)
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
      fixed: true,
      archived: true,
      sortOrder: 99,
    })

    expect(updated?.name).toBe('Updated')
    expect(updated?.fixed).toBe(true)
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

  test('removes entries for deleted category from all periods', () => {
    const vault = createEmptyVault()
    const category = createCategory(vault, { name: 'Test', type: 'income', groupName: 'Group' })

    const period1 = createPeriod(vault, 2024, 1)
    const period2 = createPeriod(vault, 2024, 2)
    period1.entries.push({ categoryId: category.id, plannedAmount: '100.00', actualAmount: '100.00' })
    period2.entries.push({ categoryId: category.id, plannedAmount: '200.00', actualAmount: '200.00' })

    deleteCategory(vault, category.id)

    expect(period1.entries).toHaveLength(0)
    expect(period2.entries).toHaveLength(0)
  })

  test('does not affect entries for other categories', () => {
    const vault = createEmptyVault()
    const cat1 = createCategory(vault, { name: 'Cat1', type: 'income', groupName: 'Group' })
    const cat2 = createCategory(vault, { name: 'Cat2', type: 'income', groupName: 'Group' })

    const period = createPeriod(vault, 2024, 1)
    period.entries.push({ categoryId: cat1.id, plannedAmount: '100.00', actualAmount: '100.00' })
    period.entries.push({ categoryId: cat2.id, plannedAmount: '200.00', actualAmount: '200.00' })

    deleteCategory(vault, cat1.id)

    expect(period.entries).toHaveLength(1)
    expect(period.entries[0].categoryId).toBe(cat2.id)
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

describe('listPeriods', () => {
  test('returns empty array for empty vault', () => {
    const vault = createEmptyVault()
    const periods = listPeriods(vault)

    expect(periods).toEqual([])
  })

  test('returns periods sorted by year and month', () => {
    const vault = createEmptyVault()
    vault.budget.periods = [
      { year: 2024, month: 3, notes: '', entries: [] },
      { year: 2023, month: 12, notes: '', entries: [] },
      { year: 2024, month: 1, notes: '', entries: [] },
    ]

    const periods = listPeriods(vault)

    expect(periods[0]).toEqual({ year: 2023, month: 12, notes: '', entries: [] })
    expect(periods[1]).toEqual({ year: 2024, month: 1, notes: '', entries: [] })
    expect(periods[2]).toEqual({ year: 2024, month: 3, notes: '', entries: [] })
  })

  test('does not mutate original array', () => {
    const vault = createEmptyVault()
    vault.budget.periods = [
      { year: 2024, month: 2, notes: '', entries: [] },
      { year: 2024, month: 1, notes: '', entries: [] },
    ]

    const originalOrder = [...vault.budget.periods]
    listPeriods(vault)

    expect(vault.budget.periods).toEqual(originalOrder)
  })
})

describe('getPeriod', () => {
  test('returns existing period', () => {
    const vault = createEmptyVault()
    const period = createPeriod(vault, 2024, 3)

    const result = getPeriod(vault, 2024, 3)

    expect(result).toBe(period)
  })

  test('returns null for non-existent period', () => {
    const vault = createEmptyVault()

    const result = getPeriod(vault, 2024, 3)

    expect(result).toBeNull()
  })

  test('distinguishes between different months in same year', () => {
    const vault = createEmptyVault()
    createPeriod(vault, 2024, 1)
    createPeriod(vault, 2024, 2)

    const result = getPeriod(vault, 2024, 1)

    expect(result?.month).toBe(1)
  })

  test('distinguishes between same month in different years', () => {
    const vault = createEmptyVault()
    createPeriod(vault, 2023, 12)
    createPeriod(vault, 2024, 12)

    const result = getPeriod(vault, 2024, 12)

    expect(result?.year).toBe(2024)
  })
})

describe('createPeriod', () => {
  test('creates period successfully', () => {
    const vault = createEmptyVault()
    const period = createPeriod(vault, 2024, 3)

    expect(period.year).toBe(2024)
    expect(period.month).toBe(3)
    expect(period.notes).toBe('')
    expect(period.entries).toEqual([])
    expect(vault.budget.periods).toContain(period)
  })

  test('returns existing period if already exists', () => {
    const vault = createEmptyVault()
    const period1 = createPeriod(vault, 2024, 3)
    const period2 = createPeriod(vault, 2024, 3)

    expect(period1).toBe(period2)
    expect(vault.budget.periods).toHaveLength(1)
  })

  test('handles month boundaries', () => {
    const vault = createEmptyVault()
    const jan = createPeriod(vault, 2024, 1)
    const dec = createPeriod(vault, 2024, 12)

    expect(jan.month).toBe(1)
    expect(dec.month).toBe(12)
  })

  test('handles year boundaries', () => {
    const vault = createEmptyVault()
    const period = createPeriod(vault, 2100, 1)

    expect(period.year).toBe(2100)
  })

  test('handles very old years', () => {
    const vault = createEmptyVault()
    const period = createPeriod(vault, 1900, 1)

    expect(period.year).toBe(1900)
  })
})

describe('copyPeriod', () => {
  test('copies entries from source to target', () => {
    const vault = createEmptyVault()
    const cat1 = createCategory(vault, { name: 'Cat1', type: 'income', groupName: 'Group' })
    const cat2 = createCategory(vault, { name: 'Cat2', type: 'expense', groupName: 'Group' })

    const source = createPeriod(vault, 2024, 1)
    source.entries = [
      { categoryId: cat1.id, plannedAmount: '100.00', actualAmount: '90.00' },
      { categoryId: cat2.id, plannedAmount: '200.00', actualAmount: '210.00' },
    ]

    const target = copyPeriod(vault, 2024, 2, 2024, 1)

    expect(target.entries).toHaveLength(2)
    expect(target.entries[0].categoryId).toBe(cat1.id)
    expect(target.entries[0].plannedAmount).toBe('100.00')
    expect(target.entries[0].actualAmount).toBe('90.00')
    expect(target.entries[1].categoryId).toBe(cat2.id)
  })

  test('does not copy if target already has entries', () => {
    const vault = createEmptyVault()
    const cat = createCategory(vault, { name: 'Cat', type: 'income', groupName: 'Group' })

    const source = createPeriod(vault, 2024, 1)
    source.entries = [{ categoryId: cat.id, plannedAmount: '100.00', actualAmount: '100.00' }]

    const target = createPeriod(vault, 2024, 2)
    target.entries = [{ categoryId: cat.id, plannedAmount: '999.00', actualAmount: '999.00' }]

    copyPeriod(vault, 2024, 2, 2024, 1)

    expect(target.entries).toHaveLength(1)
    expect(target.entries[0].plannedAmount).toBe('999.00')
  })

  test('creates target period if it does not exist', () => {
    const vault = createEmptyVault()
    createPeriod(vault, 2024, 1)

    const target = copyPeriod(vault, 2024, 2, 2024, 1)

    expect(vault.budget.periods).toHaveLength(2)
    expect(target.year).toBe(2024)
    expect(target.month).toBe(2)
  })

  test('handles copying from non-existent source', () => {
    const vault = createEmptyVault()

    const target = copyPeriod(vault, 2024, 2, 2024, 1)

    expect(target.entries).toHaveLength(0)
  })

  test('handles copying to same period', () => {
    const vault = createEmptyVault()
    const cat = createCategory(vault, { name: 'Cat', type: 'income', groupName: 'Group' })

    const source = createPeriod(vault, 2024, 1)
    source.entries = [{ categoryId: cat.id, plannedAmount: '100.00', actualAmount: '100.00' }]

    const target = copyPeriod(vault, 2024, 1, 2024, 1)

    expect(target).toBe(source)
    expect(vault.budget.periods).toHaveLength(1)
  })

  test('creates new entry objects (not references)', () => {
    const vault = createEmptyVault()
    const cat = createCategory(vault, { name: 'Cat', type: 'income', groupName: 'Group' })

    const source = createPeriod(vault, 2024, 1)
    source.entries = [{ categoryId: cat.id, plannedAmount: '100.00', actualAmount: '100.00' }]

    const target = copyPeriod(vault, 2024, 2, 2024, 1)

    expect(target.entries[0]).not.toBe(source.entries[0])
  })
})

describe('getPeriodSummary', () => {
  test('returns null for non-existent period', () => {
    const vault = createEmptyVault()

    const summary = getPeriodSummary(vault, 2024, 3)

    expect(summary).toBeNull()
  })

  test('returns summary for empty period', () => {
    const vault = createEmptyVault()
    createPeriod(vault, 2024, 3)

    const summary = getPeriodSummary(vault, 2024, 3)

    expect(summary).not.toBeNull()
    expect(summary!.year).toBe(2024)
    expect(summary!.month).toBe(3)
    expect(summary!.notes).toBe('')
    expect(summary!.entries).toEqual([])
    expect(summary!.totalPlannedIncome).toBe('0.00')
    expect(summary!.totalActualIncome).toBe('0.00')
    expect(summary!.totalPlannedExpenses).toBe('0.00')
    expect(summary!.totalActualExpenses).toBe('0.00')
    expect(summary!.plannedBalance).toBe('0.00')
    expect(summary!.actualBalance).toBe('0.00')
  })

  test('calculates totals correctly', () => {
    const vault = createEmptyVault()
    const income = createCategory(vault, { name: 'Salary', type: 'income', groupName: 'Employment' })
    const expense1 = createCategory(vault, { name: 'Rent', type: 'expense', groupName: 'Housing' })
    const expense2 = createCategory(vault, { name: 'Food', type: 'expense', groupName: 'Living' })

    const period = createPeriod(vault, 2024, 3)
    period.entries = [
      { categoryId: income.id, plannedAmount: '5000.00', actualAmount: '5100.00' },
      { categoryId: expense1.id, plannedAmount: '1500.00', actualAmount: '1500.00' },
      { categoryId: expense2.id, plannedAmount: '500.00', actualAmount: '550.00' },
    ]

    const summary = getPeriodSummary(vault, 2024, 3)

    expect(summary!.totalPlannedIncome).toBe('5000.00')
    expect(summary!.totalActualIncome).toBe('5100.00')
    expect(summary!.totalPlannedExpenses).toBe('2000.00')
    expect(summary!.totalActualExpenses).toBe('2050.00')
    expect(summary!.plannedBalance).toBe('3000.00')
    expect(summary!.actualBalance).toBe('3050.00')
  })

  test('shows all categories even without entries', () => {
    const vault = createEmptyVault()
    createCategory(vault, { name: 'Salary', type: 'income', groupName: 'Employment' })
    createCategory(vault, { name: 'Rent', type: 'expense', groupName: 'Housing' })

    createPeriod(vault, 2024, 3)

    const summary = getPeriodSummary(vault, 2024, 3)

    expect(summary!.entries).toHaveLength(2)
    expect(summary!.entries[0].plannedAmount).toBe('0.00')
    expect(summary!.entries[0].actualAmount).toBe('0.00')
  })

  test('excludes archived categories', () => {
    const vault = createEmptyVault()
    const active = createCategory(vault, { name: 'Active', type: 'income', groupName: 'Group' })
    const archived = createCategory(vault, { name: 'Archived', type: 'income', groupName: 'Group' })
    updateCategory(vault, archived.id, { archived: true })

    createPeriod(vault, 2024, 3)

    const summary = getPeriodSummary(vault, 2024, 3)

    expect(summary!.entries).toHaveLength(1)
    expect(summary!.entries[0].categoryId).toBe(active.id)
  })

  test('includes period notes', () => {
    const vault = createEmptyVault()
    const period = createPeriod(vault, 2024, 3)
    period.notes = 'Test notes'

    const summary = getPeriodSummary(vault, 2024, 3)

    expect(summary!.notes).toBe('Test notes')
  })

  test('handles negative balance', () => {
    const vault = createEmptyVault()
    const income = createCategory(vault, { name: 'Salary', type: 'income', groupName: 'Employment' })
    const expense = createCategory(vault, { name: 'Rent', type: 'expense', groupName: 'Housing' })

    const period = createPeriod(vault, 2024, 3)
    period.entries = [
      { categoryId: income.id, plannedAmount: '1000.00', actualAmount: '1000.00' },
      { categoryId: expense.id, plannedAmount: '2000.00', actualAmount: '2000.00' },
    ]

    const summary = getPeriodSummary(vault, 2024, 3)

    expect(summary!.plannedBalance).toBe('-1000.00')
    expect(summary!.actualBalance).toBe('-1000.00')
  })

  test('handles decimal precision', () => {
    const vault = createEmptyVault()
    const income = createCategory(vault, { name: 'Salary', type: 'income', groupName: 'Employment' })

    const period = createPeriod(vault, 2024, 3)
    period.entries = [
      { categoryId: income.id, plannedAmount: '1234.56', actualAmount: '1234.78' },
    ]

    const summary = getPeriodSummary(vault, 2024, 3)

    expect(summary!.totalPlannedIncome).toBe('1234.56')
    expect(summary!.totalActualIncome).toBe('1234.78')
  })

  test('includes category metadata in entries', () => {
    const vault = createEmptyVault()
    const group = createGroup(vault, 'Employment', 'income')
    const category = createCategory(vault, {
      name: 'Salary',
      type: 'income',
      groupName: 'Employment',
      fixed: true,
    })

    createPeriod(vault, 2024, 3)

    const summary = getPeriodSummary(vault, 2024, 3)

    expect(summary!.entries[0].categoryId).toBe(category.id)
    expect(summary!.entries[0].categoryName).toBe('Salary')
    expect(summary!.entries[0].categoryType).toBe('income')
    expect(summary!.entries[0].categoryGroupId).toBe(group.id)
    expect(summary!.entries[0].categoryGroupName).toBe('Employment')
    expect(summary!.entries[0].categoryFixed).toBe(true)
  })

  test('handles category with missing group', () => {
    const vault = createEmptyVault()
    vault.budget.categories = [
      { id: 'cat1', name: 'Test', type: 'income', sortOrder: 10, archived: false, groupId: 'missing-group', fixed: false },
    ]

    createPeriod(vault, 2024, 3)

    const summary = getPeriodSummary(vault, 2024, 3)

    expect(summary!.entries[0].categoryGroupName).toBe('')
  })
})

describe('upsertEntry', () => {
  test('creates entry for category if it does not exist', () => {
    const vault = createEmptyVault()
    const category = createCategory(vault, { name: 'Salary', type: 'income', groupName: 'Employment' })
    createPeriod(vault, 2024, 3)

    upsertEntry(vault, 2024, 3, category.id, 'planned', '5000.00')

    const period = getPeriod(vault, 2024, 3)
    expect(period!.entries).toHaveLength(1)
    expect(period!.entries[0].categoryId).toBe(category.id)
    expect(period!.entries[0].plannedAmount).toBe('5000.00')
    expect(period!.entries[0].actualAmount).toBe('0.00')
  })

  test('updates existing entry', () => {
    const vault = createEmptyVault()
    const category = createCategory(vault, { name: 'Salary', type: 'income', groupName: 'Employment' })
    const period = createPeriod(vault, 2024, 3)
    period.entries = [{ categoryId: category.id, plannedAmount: '5000.00', actualAmount: '0.00' }]

    upsertEntry(vault, 2024, 3, category.id, 'planned', '6000.00')

    expect(period.entries).toHaveLength(1)
    expect(period.entries[0].plannedAmount).toBe('6000.00')
  })

  test('updates actual amount', () => {
    const vault = createEmptyVault()
    const category = createCategory(vault, { name: 'Salary', type: 'income', groupName: 'Employment' })
    createPeriod(vault, 2024, 3)

    upsertEntry(vault, 2024, 3, category.id, 'actual', '5100.00')

    const period = getPeriod(vault, 2024, 3)
    expect(period!.entries[0].actualAmount).toBe('5100.00')
    expect(period!.entries[0].plannedAmount).toBe('0.00')
  })

  test('creates period if it does not exist', () => {
    const vault = createEmptyVault()
    const category = createCategory(vault, { name: 'Salary', type: 'income', groupName: 'Employment' })

    upsertEntry(vault, 2024, 3, category.id, 'planned', '5000.00')

    expect(vault.budget.periods).toHaveLength(1)
    expect(vault.budget.periods[0].year).toBe(2024)
    expect(vault.budget.periods[0].month).toBe(3)
  })

  test('auto-updates actual for fixed categories', () => {
    const vault = createEmptyVault()
    const category = createCategory(vault, {
      name: 'Rent',
      type: 'expense',
      groupName: 'Housing',
      fixed: true,
    })

    upsertEntry(vault, 2024, 3, category.id, 'planned', '1500.00')

    const period = getPeriod(vault, 2024, 3)
    expect(period!.entries[0].plannedAmount).toBe('1500.00')
    expect(period!.entries[0].actualAmount).toBe('1500.00')
  })

  test('does not auto-update actual for non-fixed categories', () => {
    const vault = createEmptyVault()
    const category = createCategory(vault, {
      name: 'Food',
      type: 'expense',
      groupName: 'Living',
      fixed: false,
    })

    upsertEntry(vault, 2024, 3, category.id, 'planned', '500.00')

    const period = getPeriod(vault, 2024, 3)
    expect(period!.entries[0].plannedAmount).toBe('500.00')
    expect(period!.entries[0].actualAmount).toBe('0.00')
  })

  test('handles zero amounts', () => {
    const vault = createEmptyVault()
    const category = createCategory(vault, { name: 'Test', type: 'income', groupName: 'Group' })

    upsertEntry(vault, 2024, 3, category.id, 'planned', '0.00')

    const period = getPeriod(vault, 2024, 3)
    expect(period!.entries[0].plannedAmount).toBe('0.00')
  })

  test('handles negative amounts', () => {
    const vault = createEmptyVault()
    const category = createCategory(vault, { name: 'Test', type: 'income', groupName: 'Group' })

    upsertEntry(vault, 2024, 3, category.id, 'planned', '-100.00')

    const period = getPeriod(vault, 2024, 3)
    expect(period!.entries[0].plannedAmount).toBe('-100.00')
  })

  test('handles very large amounts', () => {
    const vault = createEmptyVault()
    const category = createCategory(vault, { name: 'Test', type: 'income', groupName: 'Group' })

    upsertEntry(vault, 2024, 3, category.id, 'planned', '999999999.99')

    const period = getPeriod(vault, 2024, 3)
    expect(period!.entries[0].plannedAmount).toBe('999999999.99')
  })

  test('handles empty string amount', () => {
    const vault = createEmptyVault()
    const category = createCategory(vault, { name: 'Test', type: 'income', groupName: 'Group' })

    upsertEntry(vault, 2024, 3, category.id, 'planned', '')

    const period = getPeriod(vault, 2024, 3)
    expect(period!.entries[0].plannedAmount).toBe('')
  })
})

describe('deleteEntry', () => {
  test('removes entry from period', () => {
    const vault = createEmptyVault()
    const category = createCategory(vault, { name: 'Test', type: 'income', groupName: 'Group' })
    const period = createPeriod(vault, 2024, 3)
    period.entries = [{ categoryId: category.id, plannedAmount: '100.00', actualAmount: '100.00' }]

    deleteEntry(vault, 2024, 3, category.id)

    expect(period.entries).toHaveLength(0)
  })

  test('does not affect other entries', () => {
    const vault = createEmptyVault()
    const cat1 = createCategory(vault, { name: 'Cat1', type: 'income', groupName: 'Group' })
    const cat2 = createCategory(vault, { name: 'Cat2', type: 'income', groupName: 'Group' })
    const period = createPeriod(vault, 2024, 3)
    period.entries = [
      { categoryId: cat1.id, plannedAmount: '100.00', actualAmount: '100.00' },
      { categoryId: cat2.id, plannedAmount: '200.00', actualAmount: '200.00' },
    ]

    deleteEntry(vault, 2024, 3, cat1.id)

    expect(period.entries).toHaveLength(1)
    expect(period.entries[0].categoryId).toBe(cat2.id)
  })

  test('handles deleting from non-existent period', () => {
    const vault = createEmptyVault()

    expect(() => deleteEntry(vault, 2024, 3, 'any-id')).not.toThrow()
  })

  test('handles deleting non-existent entry', () => {
    const vault = createEmptyVault()
    createPeriod(vault, 2024, 3)

    expect(() => deleteEntry(vault, 2024, 3, 'non-existent')).not.toThrow()
  })
})

describe('seedDefaults', () => {
  test('creates default groups and categories', () => {
    const vault = createEmptyVault()

    seedDefaults(vault)

    expect(vault.budget.categoryGroups.length).toBeGreaterThan(0)
    expect(vault.budget.categories.length).toBeGreaterThan(0)
  })

  test('creates current month period with entries', () => {
    const vault = createEmptyVault()
    const now = new Date()
    const year = now.getFullYear()
    const month = now.getMonth() + 1

    seedDefaults(vault)

    const period = getPeriod(vault, year, month)
    expect(period).not.toBeNull()
    expect(period!.entries.length).toBeGreaterThan(0)
  })

  test('does not seed if categories already exist', () => {
    const vault = createEmptyVault()
    createCategory(vault, { name: 'Existing', type: 'income', groupName: 'Group' })

    seedDefaults(vault)

    expect(vault.budget.categories).toHaveLength(1)
    expect(vault.budget.categories[0].name).toBe('Existing')
  })

  test('creates fixed and non-fixed categories', () => {
    const vault = createEmptyVault()

    seedDefaults(vault)

    const fixedCount = vault.budget.categories.filter(c => c.fixed).length
    const nonFixedCount = vault.budget.categories.filter(c => !c.fixed).length

    expect(fixedCount).toBeGreaterThan(0)
    expect(nonFixedCount).toBeGreaterThan(0)
  })

  test('creates both income and expense categories', () => {
    const vault = createEmptyVault()

    seedDefaults(vault)

    const incomeCount = vault.budget.categories.filter(c => c.type === 'income').length
    const expenseCount = vault.budget.categories.filter(c => c.type === 'expense').length

    expect(incomeCount).toBeGreaterThan(0)
    expect(expenseCount).toBeGreaterThan(0)
  })

  test('sets actual amount for fixed categories in default period', () => {
    const vault = createEmptyVault()
    const now = new Date()
    const year = now.getFullYear()
    const month = now.getMonth() + 1

    seedDefaults(vault)

    const period = getPeriod(vault, year, month)
    const fixedCategories = vault.budget.categories.filter(c => c.fixed)

    for (const cat of fixedCategories) {
      const entry = period!.entries.find(e => e.categoryId === cat.id)
      expect(entry).toBeTruthy()
      expect(entry!.plannedAmount).toBe(entry!.actualAmount)
    }
  })

  test('sets actual to 0.00 for non-fixed categories in default period', () => {
    const vault = createEmptyVault()
    const now = new Date()
    const year = now.getFullYear()
    const month = now.getMonth() + 1

    seedDefaults(vault)

    const period = getPeriod(vault, year, month)
    const nonFixedCategories = vault.budget.categories.filter(c => !c.fixed)

    for (const cat of nonFixedCategories) {
      const entry = period!.entries.find(e => e.categoryId === cat.id)
      expect(entry).toBeTruthy()
      expect(entry!.actualAmount).toBe('0.00')
    }
  })

  test('creates entries with non-zero planned amounts', () => {
    const vault = createEmptyVault()
    const now = new Date()
    const year = now.getFullYear()
    const month = now.getMonth() + 1

    seedDefaults(vault)

    const period = getPeriod(vault, year, month)

    for (const entry of period!.entries) {
      expect(Number(entry.plannedAmount)).toBeGreaterThan(0)
    }
  })

  test('is idempotent', () => {
    const vault = createEmptyVault()

    seedDefaults(vault)
    const categoriesCount = vault.budget.categories.length
    const groupsCount = vault.budget.categoryGroups.length

    seedDefaults(vault)

    expect(vault.budget.categories).toHaveLength(categoriesCount)
    expect(vault.budget.categoryGroups).toHaveLength(groupsCount)
  })
})
