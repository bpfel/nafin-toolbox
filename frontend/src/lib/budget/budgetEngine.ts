import type {
  VaultData,
  BudgetVaultData,
  VaultCategoryGroup,
  VaultCategory,
  VaultPeriod,
  VaultEntry,
} from '../crypto/vault'
import { defaultRouting, primaryAccountId } from '../accounts/routing'

// --- Category Groups ---

export function listGroups(vault: VaultData): VaultCategoryGroup[] {
  return [...vault.budget.categoryGroups].sort((a, b) => a.sortOrder - b.sortOrder)
}

export function createGroup(
  vault: VaultData,
  name: string,
  type: 'income' | 'expense',
  sortOrder?: number,
): VaultCategoryGroup {
  const groups = vault.budget.categoryGroups
  const order = sortOrder ?? (groups.length > 0 ? Math.max(...groups.map(g => g.sortOrder)) + 10 : 10)
  const group: VaultCategoryGroup = {
    id: crypto.randomUUID(),
    name,
    type,
    sortOrder: order,
  }
  groups.push(group)
  return group
}

export function getOrCreateGroup(
  vault: VaultData,
  name: string,
  type: 'income' | 'expense',
): VaultCategoryGroup {
  const existing = vault.budget.categoryGroups.find(
    g => g.name === name && g.type === type,
  )
  if (existing) return existing
  return createGroup(vault, name, type)
}

// --- Categories ---

export function listCategories(vault: VaultData, includeArchived = false): VaultCategory[] {
  const cats = vault.budget.categories.filter(c => includeArchived || !c.archived)
  return cats.sort((a, b) => a.sortOrder - b.sortOrder)
}

export function createCategory(
  vault: VaultData,
  opts: {
    name: string
    type: 'income' | 'expense'
    groupName: string
    sortOrder?: number
  },
): VaultCategory {
  const group = getOrCreateGroup(vault, opts.groupName, opts.type)
  const cats = vault.budget.categories
  const order = opts.sortOrder ?? (cats.length > 0 ? Math.max(...cats.map(c => c.sortOrder)) + 10 : 10)
  // Categories are born routed: the default is legal for both types, so no
  // category ever exists unrouted or contradictory.
  const routing = defaultRouting(opts.type, primaryAccountId(vault))
  const cat: VaultCategory = {
    id: crypto.randomUUID(),
    name: opts.name,
    type: opts.type,
    sortOrder: order,
    archived: false,
    groupId: group.id,
    sourceAccountId: routing.sourceAccountId,
    sinkAccountId: routing.sinkAccountId,
  }
  cats.push(cat)
  return cat
}

export function updateCategory(
  vault: VaultData,
  categoryId: string,
  update: Partial<Pick<VaultCategory, 'name' | 'type' | 'sortOrder' | 'archived'>> & { groupName?: string },
): VaultCategory | null {
  const cat = vault.budget.categories.find(c => c.id === categoryId)
  if (!cat) return null

  if (update.name !== undefined) cat.name = update.name

  // Changing the type invalidates the existing routing: an income category
  // routed (null, A) would become an expense on the same endpoints, which is
  // an illegal combination. Re-derive the defaults rather than leave a
  // contradiction behind. A reserve cannot survive a move to income either,
  // since a reserve implies an expense with a non-null sink.
  if (update.type !== undefined && update.type !== cat.type) {
    cat.type = update.type
    const routing = defaultRouting(cat.type, primaryAccountId(vault))
    cat.sourceAccountId = routing.sourceAccountId
    cat.sinkAccountId = routing.sinkAccountId
    if (cat.type === 'income') delete cat.reserve
  }

  if (update.sortOrder !== undefined) cat.sortOrder = update.sortOrder
  if (update.archived !== undefined) cat.archived = update.archived
  if (update.groupName !== undefined) {
    const group = getOrCreateGroup(vault, update.groupName, cat.type)
    cat.groupId = group.id
  }

  return cat
}

export function deleteCategory(vault: VaultData, categoryId: string): void {
  vault.budget.categories = vault.budget.categories.filter(c => c.id !== categoryId)
  // Also remove entries for this category from all periods
  for (const period of vault.budget.periods) {
    period.entries = period.entries.filter(e => e.categoryId !== categoryId)
  }
}

export function reorderCategories(vault: VaultData, categoryIds: string[]): void {
  for (let i = 0; i < categoryIds.length; i++) {
    const cat = vault.budget.categories.find(c => c.id === categoryIds[i])
    if (cat) cat.sortOrder = (i + 1) * 10
  }
}

/**
 * Reorders category groups. `groupIds` is the full new order for one side of the
 * budget (income or expense); groups of the other type keep their sortOrder.
 *
 * Group order used to be inferred from wherever each group's first category
 * happened to land in the category sort, which meant reordering categories could
 * silently reshuffle groups. `sortOrder` on the group has always existed and is
 * what `listGroups` uses, so this makes the table read the same field rather
 * than deriving the order a second, conflicting way.
 */
export function reorderGroups(vault: VaultData, groupIds: string[]): void {
  for (let i = 0; i < groupIds.length; i++) {
    const group = vault.budget.categoryGroups.find(g => g.id === groupIds[i])
    if (group) group.sortOrder = (i + 1) * 10
  }
}

// --- Periods ---

export function listPeriods(vault: VaultData): VaultPeriod[] {
  return [...vault.budget.periods].sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year
    return a.month - b.month
  })
}

export function getPeriod(vault: VaultData, year: number, month: number): VaultPeriod | null {
  return vault.budget.periods.find(p => p.year === year && p.month === month) ?? null
}

export function createPeriod(vault: VaultData, year: number, month: number): VaultPeriod {
  const existing = getPeriod(vault, year, month)
  if (existing) return existing

  const period: VaultPeriod = {
    year,
    month,
    notes: '',
    entries: [],
  }
  vault.budget.periods.push(period)
  return period
}

export function copyPeriod(
  vault: VaultData,
  toYear: number,
  toMonth: number,
  fromYear: number,
  fromMonth: number,
): VaultPeriod {
  const source = getPeriod(vault, fromYear, fromMonth)
  const target = createPeriod(vault, toYear, toMonth)

  if (source && target.entries.length === 0) {
    target.entries = source.entries.map(e => ({
      categoryId: e.categoryId,
      plannedAmount: e.plannedAmount,
      actualAmount: e.actualAmount,
    }))
  }

  return target
}

// --- Period Summary ---

export interface PeriodSummary {
  year: number
  month: number
  notes: string
  entries: PeriodEntryView[]
  totalPlannedIncome: string
  totalActualIncome: string
  totalPlannedExpenses: string
  totalActualExpenses: string
  plannedBalance: string
  actualBalance: string
}

export interface PeriodEntryView {
  categoryId: string
  categoryName: string
  categoryType: 'income' | 'expense'
  categoryGroupId: string
  categoryGroupName: string
  plannedAmount: string
  actualAmount: string
}

export function getPeriodSummary(vault: VaultData, year: number, month: number): PeriodSummary | null {
  const period = getPeriod(vault, year, month)
  if (!period) return null

  const cats = vault.budget.categories
  const groups = vault.budget.categoryGroups

  let totalPlannedIncome = 0
  let totalActualIncome = 0
  let totalPlannedExpenses = 0
  let totalActualExpenses = 0

  const entries: PeriodEntryView[] = []

  // Build entries from categories (show all non-archived, even if no entry exists)
  for (const cat of listCategories(vault)) {
    const entry = period.entries.find(e => e.categoryId === cat.id)
    const group = groups.find(g => g.id === cat.groupId)
    const planned = Number(entry?.plannedAmount ?? '0')
    const actual = Number(entry?.actualAmount ?? '0')

    entries.push({
      categoryId: cat.id,
      categoryName: cat.name,
      categoryType: cat.type,
      categoryGroupId: cat.groupId,
      categoryGroupName: group?.name ?? '',
      plannedAmount: (entry?.plannedAmount ?? '0.00'),
      actualAmount: (entry?.actualAmount ?? '0.00'),
    })

    if (cat.type === 'income') {
      totalPlannedIncome += planned
      totalActualIncome += actual
    } else {
      totalPlannedExpenses += planned
      totalActualExpenses += actual
    }
  }

  return {
    year,
    month,
    notes: period.notes,
    entries,
    totalPlannedIncome: totalPlannedIncome.toFixed(2),
    totalActualIncome: totalActualIncome.toFixed(2),
    totalPlannedExpenses: totalPlannedExpenses.toFixed(2),
    totalActualExpenses: totalActualExpenses.toFixed(2),
    plannedBalance: (totalPlannedIncome - totalPlannedExpenses).toFixed(2),
    actualBalance: (totalActualIncome - totalActualExpenses).toFixed(2),
  }
}

// --- Entries ---

export function upsertEntry(
  vault: VaultData,
  year: number,
  month: number,
  categoryId: string,
  field: 'planned' | 'actual',
  amount: string,
): void {
  const period = createPeriod(vault, year, month)
  const cat = vault.budget.categories.find(c => c.id === categoryId)

  let entry = period.entries.find(e => e.categoryId === categoryId)
  if (!entry) {
    entry = { categoryId, plannedAmount: '0.00', actualAmount: '0.00' }
    period.entries.push(entry)
  }

  if (field === 'planned') {
    entry.plannedAmount = amount
  } else {
    entry.actualAmount = amount
  }
}

export function deleteEntry(vault: VaultData, year: number, month: number, categoryId: string): void {
  const period = getPeriod(vault, year, month)
  if (period) {
    period.entries = period.entries.filter(e => e.categoryId !== categoryId)
  }
}

// --- Seed Defaults ---

interface DefaultGroup {
  name: string
  type: 'income' | 'expense'
  sortOrder: number
}

interface DefaultCategory {
  name: string
  type: 'income' | 'expense'
  sortOrder: number
  groupName: string
  amount: string
}

function bfsDefaultGroups(): DefaultGroup[] {
  return [
    { name: 'Employment', type: 'income', sortOrder: 1 },
    { name: 'Housing', type: 'expense', sortOrder: 10 },
    { name: 'Insurance & Taxes', type: 'expense', sortOrder: 20 },
    { name: 'Living', type: 'expense', sortOrder: 30 },
    { name: 'Lifestyle', type: 'expense', sortOrder: 40 },
    { name: 'Savings', type: 'expense', sortOrder: 50 },
  ]
}

function bfsDefaults(): DefaultCategory[] {
  return [
    { name: 'Salary (net)', type: 'income', sortOrder: 10, groupName: 'Employment', amount: '6000.00' },
    { name: 'Rent', type: 'expense', sortOrder: 10, groupName: 'Housing', amount: '1350.00' },
    { name: 'Utilities', type: 'expense', sortOrder: 20, groupName: 'Housing', amount: '150.00' },
    { name: 'Health Insurance', type: 'expense', sortOrder: 10, groupName: 'Insurance & Taxes', amount: '391.67' },
    { name: 'Other Insurance', type: 'expense', sortOrder: 20, groupName: 'Insurance & Taxes', amount: '166.67' },
    { name: 'Taxes', type: 'expense', sortOrder: 30, groupName: 'Insurance & Taxes', amount: '833.33' },
    { name: 'Food & Groceries', type: 'expense', sortOrder: 10, groupName: 'Living', amount: '500.00' },
    { name: 'Transportation', type: 'expense', sortOrder: 20, groupName: 'Living', amount: '400.00' },
    { name: 'Telecommunications', type: 'expense', sortOrder: 30, groupName: 'Living', amount: '80.00' },
    { name: 'Clothing & Footwear', type: 'expense', sortOrder: 10, groupName: 'Lifestyle', amount: '100.00' },
    { name: 'Entertainment & Recreation', type: 'expense', sortOrder: 20, groupName: 'Lifestyle', amount: '250.00' },
    { name: 'Dining Out', type: 'expense', sortOrder: 30, groupName: 'Lifestyle', amount: '250.00' },
    { name: 'Savings', type: 'expense', sortOrder: 10, groupName: 'Savings', amount: '500.00' },
    // Pillar 3a is budgeted like any other set-aside: the money leaves the
    // spending plan but stays yours. 588.00 is the 2026 employee cap (7'056)
    // spread over twelve months — a starting point, not a rule.
    { name: 'Pillar 3a', type: 'expense', sortOrder: 20, groupName: 'Savings', amount: '588.00' },
  ]
}

export function seedDefaults(vault: VaultData): void {
  if (vault.budget.categories.length > 0) return

  // Create groups
  for (const dg of bfsDefaultGroups()) {
    createGroup(vault, dg.name, dg.type, dg.sortOrder)
  }

  // Create categories
  const categories: VaultCategory[] = []
  for (const d of bfsDefaults()) {
    const cat = createCategory(vault, {
      name: d.name,
      type: d.type,
      groupName: d.groupName,
      sortOrder: d.sortOrder,
    })
    categories.push(cat)
  }

  // Create current month period with entries
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  const period = createPeriod(vault, year, month)

  const defaults = bfsDefaults()
  for (let i = 0; i < categories.length; i++) {
    const cat = categories[i]
    const d = defaults[i]
    const entry: VaultEntry = {
      categoryId: cat.id,
      plannedAmount: d.amount,
      actualAmount: '0.00',
    }
    period.entries.push(entry)
  }
}
