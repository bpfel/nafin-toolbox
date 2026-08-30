import type {
  VaultData,
  VaultCategory,
  VaultEntry,
  VaultArchive,
  VaultArchiveLine,
} from '../crypto/vault'
import { defaultRouting, primaryAccountId } from '../accounts/routing'
import { seedNamesFor, type SeedKey } from './seedNames'
import type { Locale } from '../i18n/index.svelte'

// --- Entry Categories ---

export function listCategories(vault: VaultData): VaultCategory[] {
  return [...vault.budget.categories].sort((a, b) => a.sortOrder - b.sortOrder)
}

export function createCategory(
  vault: VaultData,
  name: string,
  type: 'income' | 'expense',
  sortOrder?: number,
): VaultCategory {
  const categories = vault.budget.categories
  const order = sortOrder ?? (categories.length > 0 ? Math.max(...categories.map(g => g.sortOrder)) + 10 : 10)
  const category: VaultCategory = {
    id: crypto.randomUUID(),
    name,
    type,
    sortOrder: order,
  }
  categories.push(category)
  return category
}

export function getOrCreateCategory(
  vault: VaultData,
  name: string,
  type: 'income' | 'expense',
): VaultCategory {
  const existing = vault.budget.categories.find(
    g => g.name === name && g.type === type,
  )
  if (existing) return existing
  return createCategory(vault, name, type)
}

/**
 * Drops any category no entry points at any more.
 *
 * Categories are created in two places: getOrCreateCategory, which is only reachable by
 * creating an entry, and seedDefaults, which fills every category it makes in the
 * same pass. Neither leaves an empty one behind on purpose, so a category with no
 * entries is residue from the last one leaving. The table already builds its
 * headers from entries and stops drawing it, so this only makes the stored
 * vault agree with what the user is looking at.
 *
 * It is not merely tidiness. findCategoryConflict searches every stored category, so a
 * lingering empty one collides with a rename while being invisible on screen:
 * "an expense category called Housing already exists", about a category the user
 * cannot find anywhere to do anything about.
 *
 * Archived entries still count as occupants — they can come back, and their
 * category should be waiting for them.
 *
 * If a future feature ever lets someone create a category before filling it, this
 * has to become targeted at the category just emptied instead of a sweep.
 */
function pruneEmptyCategories(vault: VaultData): void {
  const occupied = new Set(vault.budget.entries.map(c => c.categoryId))
  vault.budget.categories = vault.budget.categories.filter(g => occupied.has(g.id))
}

/** Every entry filed under a category, archived ones included. */
export function entriesInCategory(vault: VaultData, categoryId: string): VaultEntry[] {
  return vault.budget.entries.filter(c => c.categoryId === categoryId)
}

/**
 * The category a rename or type change would collide with, if any.
 *
 * Name and type together are already a category's identity everywhere else:
 * getOrCreateCategory matches on the pair, so no normal path can produce two
 * same-named expense categories. A rename must not manufacture the duplicate that
 * creation refuses to make, so the caller is expected to offer a merge instead.
 */
export function findCategoryConflict(
  vault: VaultData,
  categoryId: string,
  name: string,
  type: 'income' | 'expense',
): VaultCategory | null {
  const trimmed = name.trim()
  return (
    vault.budget.categories.find(
      g => g.id !== categoryId && g.type === type && g.name === trimmed,
    ) ?? null
  )
}

/**
 * Renames a category, moves it to the other side of the budget, or both.
 *
 * A type change carries every entry in the category across with it. It has to:
 * getPlanSummary reads each entry's own type, so an income category holding
 * expense entries would be counted on the wrong side. updateEntry does the
 * carrying, which means routing is re-derived and reserves are dropped by
 * exactly the same code that handles one entry changing type on its own.
 *
 * Throws on an empty name or a collision, for the caller to show against the
 * field the user typed in — the same contract renameArchive has.
 */
export function updateCategory(
  vault: VaultData,
  categoryId: string,
  update: { name?: string; type?: 'income' | 'expense' },
): void {
  const category = vault.budget.categories.find(g => g.id === categoryId)
  if (!category) return

  const name = (update.name ?? category.name).trim()
  if (name === '') {
    throw new Error('a category needs a name')
  }

  const type = update.type ?? category.type
  if (findCategoryConflict(vault, categoryId, name, type)) {
    throw new Error(`a ${type} category called "${name}" already exists`)
  }

  if (type !== category.type) {
    for (const cat of entriesInCategory(vault, categoryId)) {
      updateEntry(vault, cat.id, { type })
    }
    category.type = type
  }
  category.name = name
}

/**
 * Empties one category into another and removes it.
 *
 * Offered when a rename collides, because re-filing every entry by hand is
 * the workflow this whole feature exists to replace. Entries crossing between
 * an income and an expense category change type on the way, through updateEntry,
 * so they arrive routed correctly rather than contradicting their new category.
 */
export function mergeCategory(vault: VaultData, fromId: string, intoId: string): void {
  if (fromId === intoId) return
  const from = vault.budget.categories.find(g => g.id === fromId)
  const into = vault.budget.categories.find(g => g.id === intoId)
  if (!from || !into) return

  for (const cat of entriesInCategory(vault, fromId)) {
    if (cat.type !== into.type) updateEntry(vault, cat.id, { type: into.type })
    cat.categoryId = into.id
  }
  vault.budget.categories = vault.budget.categories.filter(g => g.id !== fromId)
}

// --- Entries ---

export function listEntries(vault: VaultData, includeArchived = false): VaultEntry[] {
  const cats = vault.budget.entries.filter(c => includeArchived || !c.archived)
  return cats.sort((a, b) => a.sortOrder - b.sortOrder)
}

export function createEntry(
  vault: VaultData,
  opts: {
    name: string
    type: 'income' | 'expense'
    categoryName: string
    sortOrder?: number
  },
): VaultEntry {
  const category = getOrCreateCategory(vault, opts.categoryName, opts.type)
  const cats = vault.budget.entries
  const order = opts.sortOrder ?? (cats.length > 0 ? Math.max(...cats.map(c => c.sortOrder)) + 10 : 10)
  // Entries are born routed: the default is legal for both types, so no
  // entry ever exists unrouted or contradictory.
  const routing = defaultRouting(opts.type, primaryAccountId(vault))
  const cat: VaultEntry = {
    id: crypto.randomUUID(),
    name: opts.name,
    type: opts.type,
    sortOrder: order,
    archived: false,
    categoryId: category.id,
    sourceAccountId: routing.sourceAccountId,
    sinkAccountId: routing.sinkAccountId,
  }
  cats.push(cat)
  return cat
}

export function updateEntry(
  vault: VaultData,
  entryId: string,
  update: Partial<Pick<VaultEntry, 'name' | 'type' | 'sortOrder' | 'archived'>> & { categoryName?: string },
): VaultEntry | null {
  const cat = vault.budget.entries.find(c => c.id === entryId)
  if (!cat) return null

  if (update.name !== undefined) cat.name = update.name

  // Changing the type invalidates the existing routing: an income entry
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
  if (update.categoryName !== undefined) {
    const category = getOrCreateCategory(vault, update.categoryName, cat.type)
    cat.categoryId = category.id
    // Moving the last entry out empties the category it came from.
    pruneEmptyCategories(vault)
  }

  return cat
}

export function deleteEntry(vault: VaultData, entryId: string): void {
  vault.budget.entries = vault.budget.entries.filter(c => c.id !== entryId)
  // The plan is keyed by entry, so a deleted entry's line would otherwise
  // linger as an amount nothing can display or edit. Archives are deliberately
  // left alone: they hold names, not references, and a record of a past plan
  // must not lose lines because an entry was deleted afterwards.
  vault.budget.plan = vault.budget.plan.filter(e => e.entryId !== entryId)
  pruneEmptyCategories(vault)
}

export function reorderEntries(vault: VaultData, entryIds: string[]): void {
  for (let i = 0; i < entryIds.length; i++) {
    const cat = vault.budget.entries.find(c => c.id === entryIds[i])
    if (cat) cat.sortOrder = (i + 1) * 10
  }
}

/**
 * Reorders entry categories. `categoryIds` is the full new order for one side of the
 * budget (income or expense); categories of the other type keep their sortOrder.
 *
 * Category order used to be inferred from wherever each category's first entry
 * happened to land in the entry sort, which meant reordering entries could
 * silently reshuffle categories. `sortOrder` on the category has always existed and is
 * what `listCategories` uses, so this makes the table read the same field rather
 * than deriving the order a second, conflicting way.
 */
export function reorderCategories(vault: VaultData, categoryIds: string[]): void {
  for (let i = 0; i < categoryIds.length; i++) {
    const category = vault.budget.categories.find(g => g.id === categoryIds[i])
    if (category) category.sortOrder = (i + 1) * 10
  }
}

// --- The plan ---

/**
 * The planned amount for one entry, '0.00' when the plan has no line for it.
 *
 * A missing line and a zero line mean the same thing to every reader, so the
 * plan stays sparse rather than carrying a row per entry.
 */
export function plannedFor(vault: VaultData, entryId: string): string {
  const entry = vault.budget.plan.find(e => e.entryId === entryId)
  return entry?.plannedAmount ?? '0.00'
}

/** Sets the planned amount for one entry, creating its line if absent. */
export function setPlanned(vault: VaultData, entryId: string, amount: string): void {
  const entry = vault.budget.plan.find(e => e.entryId === entryId)
  if (entry) {
    entry.plannedAmount = amount
    return
  }
  vault.budget.plan.push({ entryId, plannedAmount: amount })
}

// --- Plan summary ---

export interface PlanEntryView {
  entryId: string
  entryName: string
  entryType: 'income' | 'expense'
  categoryId: string
  categoryName: string
  plannedAmount: string
}

export interface PlanSummary {
  entries: PlanEntryView[]
  totalPlannedIncome: string
  totalPlannedExpenses: string
  plannedBalance: string
}

/**
 * One row per non-archived entry, in entry sort order, whether or not the
 * plan has a line for it — an entry with nothing planned is still part of the
 * budget and must be visible to be filled in.
 *
 * `plannedBalance` is income minus expenses, which keeps the zero-based reading
 * the budget is built around: every franc of income is meant to be assigned, so
 * a balanced plan reads 0.00 rather than "some surplus somewhere".
 */
export function getPlanSummary(vault: VaultData): PlanSummary {
  const categories = vault.budget.categories

  let totalPlannedIncome = 0
  let totalPlannedExpenses = 0

  const entries: PlanEntryView[] = []

  for (const cat of listEntries(vault)) {
    const category = categories.find(g => g.id === cat.categoryId)
    const plannedAmount = plannedFor(vault, cat.id)
    const planned = Number(plannedAmount)

    entries.push({
      entryId: cat.id,
      entryName: cat.name,
      entryType: cat.type,
      categoryId: cat.categoryId,
      categoryName: category?.name ?? '',
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
 * The lines are DENORMALISED — entry and category names are copied in, not
 * referenced. An archive that pointed at live entries would be rewritten by
 * the next rename and would lose lines to the next delete, which would make it
 * a view of the present rather than a record of the past.
 *
 * The snapshot covers what the plan summary shows: every non-archived entry,
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

  const categoryNameById = new Map(vault.budget.categories.map(g => [g.id, g.name]))

  const lines: VaultArchiveLine[] = listEntries(vault).map(cat => ({
    entryName: cat.name,
    categoryName: categoryNameById.get(cat.categoryId) ?? '',
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
 * Empties the budget: every entry, every category, and the plan itself.
 *
 * Archives are deliberately left standing. They are records of what was
 * budgeted, denormalised down to names rather than references (see archivePlan),
 * so nothing in them breaks when the entries they describe cease to exist —
 * the same bargain deleteEntry already makes. A reset is for starting the
 * plan over, not for erasing what the plan used to say.
 */
export function resetBudget(vault: VaultData): void {
  vault.budget.entries = []
  vault.budget.categories = []
  vault.budget.plan = []
}

// --- Seed Defaults ---

interface DefaultCategory {
  key: SeedKey
  type: 'income' | 'expense'
  sortOrder: number
}

interface DefaultEntry {
  key: SeedKey
  type: 'income' | 'expense'
  sortOrder: number
  categoryKey: SeedKey
  amount: string
}

function bfsDefaultCategories(): DefaultCategory[] {
  return [
    { key: 'cat.employment', type: 'income', sortOrder: 1 },
    { key: 'cat.housing', type: 'expense', sortOrder: 10 },
    { key: 'cat.insuranceTaxes', type: 'expense', sortOrder: 20 },
    { key: 'cat.living', type: 'expense', sortOrder: 30 },
    { key: 'cat.lifestyle', type: 'expense', sortOrder: 40 },
    { key: 'cat.savings', type: 'expense', sortOrder: 50 },
  ]
}

function bfsDefaults(): DefaultEntry[] {
  return [
    { key: 'salaryNet', type: 'income', sortOrder: 10, categoryKey: 'cat.employment', amount: '6000.00' },
    { key: 'rent', type: 'expense', sortOrder: 10, categoryKey: 'cat.housing', amount: '1350.00' },
    { key: 'utilities', type: 'expense', sortOrder: 20, categoryKey: 'cat.housing', amount: '150.00' },
    { key: 'healthInsurance', type: 'expense', sortOrder: 10, categoryKey: 'cat.insuranceTaxes', amount: '391.67' },
    { key: 'otherInsurance', type: 'expense', sortOrder: 20, categoryKey: 'cat.insuranceTaxes', amount: '166.67' },
    { key: 'taxes', type: 'expense', sortOrder: 30, categoryKey: 'cat.insuranceTaxes', amount: '833.33' },
    { key: 'groceries', type: 'expense', sortOrder: 10, categoryKey: 'cat.living', amount: '500.00' },
    { key: 'transport', type: 'expense', sortOrder: 20, categoryKey: 'cat.living', amount: '400.00' },
    { key: 'telecoms', type: 'expense', sortOrder: 30, categoryKey: 'cat.living', amount: '80.00' },
    { key: 'clothing', type: 'expense', sortOrder: 10, categoryKey: 'cat.lifestyle', amount: '100.00' },
    { key: 'entertainment', type: 'expense', sortOrder: 20, categoryKey: 'cat.lifestyle', amount: '250.00' },
    { key: 'diningOut', type: 'expense', sortOrder: 30, categoryKey: 'cat.lifestyle', amount: '250.00' },
    { key: 'savings', type: 'expense', sortOrder: 10, categoryKey: 'cat.savings', amount: '500.00' },
    // Pillar 3a is budgeted like any other set-aside: the money leaves the
    // spending plan but stays yours. 588.00 is the 2026 employee cap (7'056)
    // spread over twelve months — a starting point, not a rule.
    { key: 'pillar3a', type: 'expense', sortOrder: 20, categoryKey: 'cat.savings', amount: '588.00' },
  ]
}

/**
 * Writes the starter budget, named in the given language.
 *
 * The names are written in once and are the user's from then on — editing one
 * sticks, and switching language later leaves them alone. That is the whole
 * reason they are data here rather than slugs resolved at render.
 */
export function seedDefaults(vault: VaultData, locale: Locale = 'en'): void {
  if (vault.budget.entries.length > 0) return

  const name = seedNamesFor(locale)

  for (const dc of bfsDefaultCategories()) {
    createCategory(vault, name[dc.key], dc.type, dc.sortOrder)
  }

  // Each entry gets its suggested amount in the plan. There is no month to seed
  // and no actual to record: the plan is the budget.
  for (const d of bfsDefaults()) {
    const entry = createEntry(vault, {
      name: name[d.key],
      type: d.type,
      categoryName: name[d.categoryKey],
      sortOrder: d.sortOrder,
    })
    setPlanned(vault, entry.id, d.amount)
  }
}
