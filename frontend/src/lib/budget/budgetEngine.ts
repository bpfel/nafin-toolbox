import type {
  VaultData,
  VaultCategoryGroup,
  VaultCategory,
  VaultArchive,
  VaultArchiveLine,
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

/**
 * Drops any group no category points at any more.
 *
 * Groups are created in two places: getOrCreateGroup, which is only reachable by
 * creating a category, and seedDefaults, which fills every group it makes in the
 * same pass. Neither leaves an empty one behind on purpose, so a group with no
 * categories is residue from the last one leaving. The table already builds its
 * headers from categories and stops drawing it, so this only makes the stored
 * vault agree with what the user is looking at.
 *
 * It is not merely tidiness. findGroupConflict searches every stored group, so a
 * lingering empty one collides with a rename while being invisible on screen:
 * "an expense group called Housing already exists", about a group the user
 * cannot find anywhere to do anything about.
 *
 * Archived categories still count as occupants — they can come back, and their
 * group should be waiting for them.
 *
 * If a future feature ever lets someone create a group before filling it, this
 * has to become targeted at the group just emptied instead of a sweep.
 */
function pruneEmptyGroups(vault: VaultData): void {
  const occupied = new Set(vault.budget.categories.map(c => c.groupId))
  vault.budget.categoryGroups = vault.budget.categoryGroups.filter(g => occupied.has(g.id))
}

/** Every category filed under a group, archived ones included. */
export function categoriesInGroup(vault: VaultData, groupId: string): VaultCategory[] {
  return vault.budget.categories.filter(c => c.groupId === groupId)
}

/**
 * The group a rename or type change would collide with, if any.
 *
 * Name and type together are already a group's identity everywhere else:
 * getOrCreateGroup matches on the pair, so no normal path can produce two
 * same-named expense groups. A rename must not manufacture the duplicate that
 * creation refuses to make, so the caller is expected to offer a merge instead.
 */
export function findGroupConflict(
  vault: VaultData,
  groupId: string,
  name: string,
  type: 'income' | 'expense',
): VaultCategoryGroup | null {
  const trimmed = name.trim()
  return (
    vault.budget.categoryGroups.find(
      g => g.id !== groupId && g.type === type && g.name === trimmed,
    ) ?? null
  )
}

/**
 * Renames a group, moves it to the other side of the budget, or both.
 *
 * A type change carries every category in the group across with it. It has to:
 * getPlanSummary reads each category's own type, so an income group holding
 * expense categories would be counted on the wrong side. updateCategory does the
 * carrying, which means routing is re-derived and reserves are dropped by
 * exactly the same code that handles one category changing type on its own.
 *
 * Throws on an empty name or a collision, for the caller to show against the
 * field the user typed in — the same contract renameArchive has.
 */
export function updateGroup(
  vault: VaultData,
  groupId: string,
  update: { name?: string; type?: 'income' | 'expense' },
): void {
  const group = vault.budget.categoryGroups.find(g => g.id === groupId)
  if (!group) return

  const name = (update.name ?? group.name).trim()
  if (name === '') {
    throw new Error('a group needs a name')
  }

  const type = update.type ?? group.type
  if (findGroupConflict(vault, groupId, name, type)) {
    throw new Error(`a ${type} group called "${name}" already exists`)
  }

  if (type !== group.type) {
    for (const cat of categoriesInGroup(vault, groupId)) {
      updateCategory(vault, cat.id, { type })
    }
    group.type = type
  }
  group.name = name
}

/**
 * Empties one group into another and removes it.
 *
 * Offered when a rename collides, because re-filing every category by hand is
 * the workflow this whole feature exists to replace. Categories crossing between
 * an income and an expense group change type on the way, through updateCategory,
 * so they arrive routed correctly rather than contradicting their new group.
 */
export function mergeGroup(vault: VaultData, fromId: string, intoId: string): void {
  if (fromId === intoId) return
  const from = vault.budget.categoryGroups.find(g => g.id === fromId)
  const into = vault.budget.categoryGroups.find(g => g.id === intoId)
  if (!from || !into) return

  for (const cat of categoriesInGroup(vault, fromId)) {
    if (cat.type !== into.type) updateCategory(vault, cat.id, { type: into.type })
    cat.groupId = into.id
  }
  vault.budget.categoryGroups = vault.budget.categoryGroups.filter(g => g.id !== fromId)
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
    // Moving the last category out empties the group it came from.
    pruneEmptyGroups(vault)
  }

  return cat
}

export function deleteCategory(vault: VaultData, categoryId: string): void {
  vault.budget.categories = vault.budget.categories.filter(c => c.id !== categoryId)
  // The plan is keyed by category, so a deleted category's line would otherwise
  // linger as an amount nothing can display or edit. Archives are deliberately
  // left alone: they hold names, not references, and a record of a past plan
  // must not lose lines because a category was deleted afterwards.
  vault.budget.plan = vault.budget.plan.filter(e => e.categoryId !== categoryId)
  pruneEmptyGroups(vault)
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

// --- The plan ---

/**
 * The planned amount for one category, '0.00' when the plan has no line for it.
 *
 * A missing line and a zero line mean the same thing to every reader, so the
 * plan stays sparse rather than carrying a row per category.
 */
export function plannedFor(vault: VaultData, categoryId: string): string {
  const entry = vault.budget.plan.find(e => e.categoryId === categoryId)
  return entry?.plannedAmount ?? '0.00'
}

/** Sets the planned amount for one category, creating its line if absent. */
export function setPlanned(vault: VaultData, categoryId: string, amount: string): void {
  const entry = vault.budget.plan.find(e => e.categoryId === categoryId)
  if (entry) {
    entry.plannedAmount = amount
    return
  }
  vault.budget.plan.push({ categoryId, plannedAmount: amount })
}

// --- Plan summary ---

export interface PlanEntryView {
  categoryId: string
  categoryName: string
  categoryType: 'income' | 'expense'
  categoryGroupId: string
  categoryGroupName: string
  plannedAmount: string
}

export interface PlanSummary {
  entries: PlanEntryView[]
  totalPlannedIncome: string
  totalPlannedExpenses: string
  plannedBalance: string
}

/**
 * One row per non-archived category, in category sort order, whether or not the
 * plan has a line for it — a category with nothing planned is still part of the
 * budget and must be visible to be filled in.
 *
 * `plannedBalance` is income minus expenses, which keeps the zero-based reading
 * the budget is built around: every franc of income is meant to be assigned, so
 * a balanced plan reads 0.00 rather than "some surplus somewhere".
 */
export function getPlanSummary(vault: VaultData): PlanSummary {
  const groups = vault.budget.categoryGroups

  let totalPlannedIncome = 0
  let totalPlannedExpenses = 0

  const entries: PlanEntryView[] = []

  for (const cat of listCategories(vault)) {
    const group = groups.find(g => g.id === cat.groupId)
    const plannedAmount = plannedFor(vault, cat.id)
    const planned = Number(plannedAmount)

    entries.push({
      categoryId: cat.id,
      categoryName: cat.name,
      categoryType: cat.type,
      categoryGroupId: cat.groupId,
      categoryGroupName: group?.name ?? '',
      plannedAmount,
    })

    if (cat.type === 'income') {
      totalPlannedIncome += planned
    } else {
      totalPlannedExpenses += planned
    }
  }

  return {
    entries,
    totalPlannedIncome: totalPlannedIncome.toFixed(2),
    totalPlannedExpenses: totalPlannedExpenses.toFixed(2),
    plannedBalance: (totalPlannedIncome - totalPlannedExpenses).toFixed(2),
  }
}

// --- Archives ---

/** Archives, newest first. */
export function listArchives(vault: VaultData): VaultArchive[] {
  // Stable sort over an already newest-first array, so two archives created in
  // the same millisecond keep the order they were made in.
  return [...vault.budget.archives].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

/**
 * Snapshots the current plan under a name.
 *
 * The lines are DENORMALISED — category and group names are copied in, not
 * referenced. An archive that pointed at live categories would be rewritten by
 * the next rename and would lose lines to the next delete, which would make it
 * a view of the present rather than a record of the past.
 *
 * The snapshot covers what the plan summary shows: every non-archived category,
 * including those left at 0.00, so an archive reads the same as the plan it was
 * taken from.
 */
export function archivePlan(vault: VaultData, name: string): VaultArchive {
  const trimmed = name.trim()
  if (trimmed === '') {
    // An unnamed snapshot cannot be told apart from any other, so it could never
    // be found again — better to refuse than to store something unusable.
    throw new Error('an archive needs a name')
  }

  const groupNameById = new Map(vault.budget.categoryGroups.map(g => [g.id, g.name]))

  const lines: VaultArchiveLine[] = listCategories(vault).map(cat => ({
    categoryName: cat.name,
    groupName: groupNameById.get(cat.groupId) ?? '',
    type: cat.type,
    plannedAmount: plannedFor(vault, cat.id),
  }))

  const archive: VaultArchive = {
    id: crypto.randomUUID(),
    name: trimmed,
    createdAt: new Date().toISOString(),
    lines,
  }
  vault.budget.archives.unshift(archive)
  return archive
}

/** Renames an archive. An empty name is rejected, as it is on creation. */
export function renameArchive(vault: VaultData, id: string, name: string): void {
  const trimmed = name.trim()
  if (trimmed === '') {
    throw new Error('an archive needs a name')
  }
  const archive = vault.budget.archives.find(a => a.id === id)
  if (archive) archive.name = trimmed
}

export function deleteArchive(vault: VaultData, id: string): void {
  vault.budget.archives = vault.budget.archives.filter(a => a.id !== id)
}

/**
 * Empties the budget: every category, every group, and the plan itself.
 *
 * Archives are deliberately left standing. They are records of what was
 * budgeted, denormalised down to names rather than references (see archivePlan),
 * so nothing in them breaks when the categories they describe cease to exist —
 * the same bargain deleteCategory already makes. A reset is for starting the
 * plan over, not for erasing what the plan used to say.
 */
export function resetBudget(vault: VaultData): void {
  vault.budget.categories = []
  vault.budget.categoryGroups = []
  vault.budget.plan = []
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

  // Create categories, and give each one its suggested amount in the plan.
  // There is no month to seed and no actual to record: the plan is the budget.
  for (const d of bfsDefaults()) {
    const cat = createCategory(vault, {
      name: d.name,
      type: d.type,
      groupName: d.groupName,
      sortOrder: d.sortOrder,
    })
    setPlanned(vault, cat.id, d.amount)
  }
}
