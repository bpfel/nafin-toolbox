import {
  holdsMoney,
  savesTowardsTarget,
  sideOf,
  type EntryType,
  type VaultData,
  type VaultCategory,
  type VaultEntry,
  type VaultSnapshot,
  type VaultSnapshotLine,
} from '../crypto/vault'
import { defaultRouting, primaryAccountId } from '../accounts/routing'
import { seedNamesFor, type SeedKey } from './seedNames'
import type { Locale } from '../i18n/index.svelte'
import { fromCents, toCents } from '../accounts/reserveMath'

// --- Entry Categories ---

export function listCategories(vault: VaultData): VaultCategory[] {
  return [...vault.budget.categories].sort((a, b) => a.sortOrder - b.sortOrder)
}

export function createCategory(
  vault: VaultData,
  name: string,
  side: 'income' | 'expense',
  sortOrder?: number,
): VaultCategory {
  const categories = vault.budget.categories
  const order = sortOrder ?? (categories.length > 0 ? Math.max(...categories.map(g => g.sortOrder)) + 10 : 10)
  const category: VaultCategory = {
    id: crypto.randomUUID(),
    name,
    side,
    sortOrder: order,
  }
  categories.push(category)
  return category
}

export function getOrCreateCategory(
  vault: VaultData,
  name: string,
  side: 'income' | 'expense',
): VaultCategory {
  const existing = vault.budget.categories.find(
    g => g.name === name && g.side === side,
  )
  if (existing) return existing
  return createCategory(vault, name, side)
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
  side: 'income' | 'expense',
): VaultCategory | null {
  const trimmed = name.trim()
  return (
    vault.budget.categories.find(
      g => g.id !== categoryId && g.side === side && g.name === trimmed,
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
 * field the user typed in — the same contract renameSnapshot has.
 */
export function updateCategory(
  vault: VaultData,
  categoryId: string,
  update: { name?: string; side?: 'income' | 'expense' },
): void {
  const category = vault.budget.categories.find(g => g.id === categoryId)
  if (!category) return

  const name = (update.name ?? category.name).trim()
  if (name === '') {
    throw new Error('a category needs a name')
  }

  const side = update.side ?? category.side
  if (findCategoryConflict(vault, categoryId, name, side)) {
    throw new Error(`a ${side} category called "${name}" already exists`)
  }

  if (side !== category.side) {
    // Every entry follows the heading across. Landing on the expense side they
    // become plain `expense` rather than whatever they were: a bill or a
    // purchase that has been through income has lost its target on the way, and
    // guessing which of the three it used to be would be inventing data.
    for (const cat of entriesInCategory(vault, categoryId)) {
      updateEntry(vault, cat.id, { type: side })
    }
    category.side = side
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
    if (sideOf(cat.type) !== into.side) updateEntry(vault, cat.id, { type: into.side })
    cat.categoryId = into.id
  }
  vault.budget.categories = vault.budget.categories.filter(g => g.id !== fromId)
}

// --- Entries ---

export function listEntries(vault: VaultData, includeArchived = false): VaultEntry[] {
  const cats = vault.budget.entries.filter(c => includeArchived || !c.archived)
  return cats.sort((a, b) => a.sortOrder - b.sortOrder)
}

/** A year, the period every ordinary Swiss bill and most replacements run on. */
const DEFAULT_RESERVE_PERIOD_MONTHS = 12

export function createEntry(
  vault: VaultData,
  opts: {
    name: string
    type: EntryType
    categoryName: string
    sortOrder?: number
    /**
     * What to plan for it, straight away.
     *
     * Optional only because the caller may not have asked. It used to be
     * impossible: an entry was created with nothing planned and the amount was
     * a second visit to the same dialog, which is a strange thing to insist on
     * — the amount is usually the reason someone is adding the line at all.
     */
    plannedAmount?: string
    /**
     * The month a `bill` or `purchase` reserve is anchored to. The caller knows
     * what month it is; the engine deliberately does not read a clock.
     */
    anchorMonth?: string
    /** What a `bill` or `purchase` is saving towards. */
    targetAmount?: string
    /** How long it has to get there — the billing cycle, or the item's life. */
    periodMonths?: number
  },
): VaultEntry {
  const category = getOrCreateCategory(vault, opts.categoryName, sideOf(opts.type))
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

  // A bill or a purchase is a target with a deadline, so it is born with one
  // rather than being a type that means nothing until a second screen is
  // visited. The target is proposed from what is being planned monthly — for
  // the default yearly period that is exactly the annual figure — and is the
  // first thing the user overwrites if they know the real one.
  if (savesTowardsTarget(opts.type) && opts.anchorMonth) {
    cat.reserve = {
      // The target is what the caller states; the monthly figure is what
      // follows from it. That is the way round people hold these — "two
      // thousand francs, and it lasts seven years" — and the reverse, deriving
      // a target from a monthly amount, is how an entry ended up with a rate
      // that could never meet its own schedule.
      targetAmount: opts.targetAmount ?? '0.00',
      periodMonths: opts.periodMonths ?? DEFAULT_RESERVE_PERIOD_MONTHS,
      anchorMonth: opts.anchorMonth,
    }
  }
  cats.push(cat)
  if (opts.plannedAmount !== undefined && opts.plannedAmount !== '') {
    setPlanned(vault, cat.id, opts.plannedAmount)
  }
  return cat
}

/**
 * Replaces what a bill or purchase is saving towards.
 *
 * Refused on the three types that have no target: carrying one without being
 * either a bill or a purchase is the contradiction `isLegalEntryRouting`
 * exists to reject, and it is cheaper to refuse here than to write it and
 * find out on the next save.
 */
export function setReserve(
  vault: VaultData,
  entryId: string,
  reserve: { targetAmount: string; periodMonths: number; anchorMonth: string },
): void {
  const entry = vault.budget.entries.find(e => e.id === entryId)
  if (!entry) return
  if (!savesTowardsTarget(entry.type)) {
    throw new Error(`a ${entry.type} entry has no target to save towards`)
  }
  entry.reserve = { ...reserve }
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
    if (!savesTowardsTarget(cat.type)) delete cat.reserve
  }

  if (update.sortOrder !== undefined) cat.sortOrder = update.sortOrder
  if (update.archived !== undefined) cat.archived = update.archived
  if (update.categoryName !== undefined) {
    const category = getOrCreateCategory(vault, update.categoryName, sideOf(cat.type))
    cat.categoryId = category.id
    // Moving the last entry out empties the category it came from.
    pruneEmptyCategories(vault)
  }

  return cat
}

export function deleteEntry(vault: VaultData, entryId: string): void {
  vault.budget.entries = vault.budget.entries.filter(c => c.id !== entryId)
  // The plan is keyed by entry, so a deleted entry's line would otherwise
  // linger as an amount nothing can display or edit. Snapshots are deliberately
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
  entryType: EntryType
  categoryId: string
  categoryName: string
  plannedAmount: string
  /**
   * What a year of this costs.
   *
   * Twelve monthlies for most entries, but *exact* for a bill or a purchase:
   * those know their real total and the cycle it falls on, so a year of them
   * is arithmetic rather than inference.
   *
   * It has to be, because the monthly figure is rounded to the rappen and
   * multiplying it back up shows the rounding. A GA at 3'995 a year plans at
   * 332.92 a month, and twelve of those is 3'995.04 — four rappen of nothing,
   * on a line whose whole point is that the amount is known in advance.
   */
  yearlyAmount: string
}

export interface PlanSummary {
  entries: PlanEntryView[]
  /** The three totals again, over a year, summed from the exact figures above. */
  yearlyIncome: string
  yearlyExpenses: string
  yearlySavings: string
  yearlyBalance: string
  totalPlannedIncome: string
  /** Consumed and gone. Since v7 this excludes what is only being held. */
  totalPlannedExpenses: string
  /** Savings, bills and purchases: out of the account, still in the net worth. */
  totalPlannedSavings: string
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
  let totalPlannedSavings = 0

  // Accumulated separately rather than multiplied at the end: a year is the
  // sum of exact yearly figures, not twelve times a sum of rounded monthly
  // ones, and those differ by a rappen per reserve.
  let yearlyIncome = 0
  let yearlyExpenses = 0
  let yearlySavings = 0

  const entries: PlanEntryView[] = []

  for (const cat of listEntries(vault)) {
    const category = categories.find(g => g.id === cat.categoryId)
    const plannedAmount = plannedFor(vault, cat.id)
    const planned = Number(plannedAmount)
    const yearlyAmount = yearlyFor(cat, plannedAmount)
    const yearly = Number(yearlyAmount)

    entries.push({
      entryId: cat.id,
      entryName: cat.name,
      entryType: cat.type,
      categoryId: cat.categoryId,
      categoryName: category?.name ?? '',
      plannedAmount,
      yearlyAmount,
    })

    if (cat.type === 'income') {
      totalPlannedIncome += planned
      yearlyIncome += yearly
    } else if (holdsMoney(cat.type)) {
      totalPlannedSavings += planned
      yearlySavings += yearly
    } else {
      totalPlannedExpenses += planned
      yearlyExpenses += yearly
    }
  }

  return {
    entries,
    totalPlannedIncome: totalPlannedIncome.toFixed(2),
    totalPlannedExpenses: totalPlannedExpenses.toFixed(2),
    // Savings, bills and purchases: out of what is spendable, but still yours.
    // Nothing could add this up before — the three were disguised as expenses,
    // and the allocation screen inferred it from routing on every keystroke.
    totalPlannedSavings: totalPlannedSavings.toFixed(2),
    plannedBalance: (totalPlannedIncome - totalPlannedExpenses - totalPlannedSavings).toFixed(2),
    yearlyIncome: yearlyIncome.toFixed(2),
    yearlyExpenses: yearlyExpenses.toFixed(2),
    yearlySavings: yearlySavings.toFixed(2),
    yearlyBalance: (yearlyIncome - yearlyExpenses - yearlySavings).toFixed(2),
  }
}

/**
 * A year of one entry.
 *
 * A bill or a purchase states its real total and the cycle it falls on, so a
 * year of it is `target x 12 / period` — exact, whatever the monthly rounds
 * to. Everything else has no figure truer than twelve of its monthly.
 *
 * In centimes, because the whole point is the rappen.
 */
function yearlyFor(entry: VaultEntry, plannedAmount: string): string {
  const reserve = entry.reserve
  if (reserve && reserve.periodMonths > 0) {
    return fromCents(Math.round((toCents(reserve.targetAmount) * 12) / reserve.periodMonths))
  }
  return fromCents(toCents(plannedAmount) * 12)
}

// --- Snapshots ---

/** Snapshots, newest first. */
export function listSnapshots(vault: VaultData): VaultSnapshot[] {
  // Stable sort over an already newest-first array, so two snapshots created in
  // the same millisecond keep the order they were made in.
  return [...vault.budget.snapshots].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

/**
 * Snapshots the current plan under a name.
 *
 * The lines are DENORMALISED — entry and category names are copied in, not
 * referenced. An snapshot that pointed at live entries would be rewritten by
 * the next rename and would lose lines to the next delete, which would make it
 * a view of the present rather than a record of the past.
 *
 * The snapshot covers what the plan summary shows: every non-archived entry,
 * including those left at 0.00, so an snapshot reads the same as the plan it was
 * taken from.
 */
export function takeSnapshot(vault: VaultData, name: string): VaultSnapshot {
  const trimmed = name.trim()
  if (trimmed === '') {
    // An unnamed snapshot cannot be told apart from any other, so it could never
    // be found again — better to refuse than to store something unusable.
    throw new Error('an snapshot needs a name')
  }

  const categoryNameById = new Map(vault.budget.categories.map(g => [g.id, g.name]))

  const lines: VaultSnapshotLine[] = listEntries(vault).map(cat => ({
    entryName: cat.name,
    categoryName: categoryNameById.get(cat.categoryId) ?? '',
    type: cat.type,
    plannedAmount: plannedFor(vault, cat.id),
  }))

  const snapshot: VaultSnapshot = {
    id: crypto.randomUUID(),
    name: trimmed,
    createdAt: new Date().toISOString(),
    lines,
  }
  vault.budget.snapshots.unshift(snapshot)
  return snapshot
}

/** Renames an snapshot. An empty name is rejected, as it is on creation. */
export function renameSnapshot(vault: VaultData, id: string, name: string): void {
  const trimmed = name.trim()
  if (trimmed === '') {
    throw new Error('an snapshot needs a name')
  }
  const snapshot = vault.budget.snapshots.find(a => a.id === id)
  if (snapshot) snapshot.name = trimmed
}

export function deleteSnapshot(vault: VaultData, id: string): void {
  vault.budget.snapshots = vault.budget.snapshots.filter(a => a.id !== id)
}

/**
 * Empties the budget: every entry, every category, and the plan itself.
 *
 * Snapshots are deliberately left standing. They are records of what was
 * budgeted, denormalised down to names rather than references (see takeSnapshot),
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
  type: EntryType
  sortOrder: number
  categoryKey: SeedKey
  amount: string
  /** What a `bill` or `purchase` is saving towards, and over how long. */
  targetAmount?: string
  periodMonths?: number
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
    // 67.08, not 400: the GA below takes 332.92 of HABE's transport figure and
    // this is the rest — the occasional taxi, a bike, a car shared for a
    // weekend. Split rather than reduced, so the two together are still
    // exactly the 400.00 the survey reports and the setup screen's claim
    // about where these numbers come from stays true.
    { key: 'transport', type: 'expense', sortOrder: 20, categoryKey: 'cat.living', amount: '67.08' },
    { key: 'telecoms', type: 'expense', sortOrder: 30, categoryKey: 'cat.living', amount: '80.00' },
    { key: 'clothing', type: 'expense', sortOrder: 10, categoryKey: 'cat.lifestyle', amount: '100.00' },
    { key: 'entertainment', type: 'expense', sortOrder: 20, categoryKey: 'cat.lifestyle', amount: '250.00' },
    { key: 'diningOut', type: 'expense', sortOrder: 30, categoryKey: 'cat.lifestyle', amount: '250.00' },
    // Serafe collects the federal radio and television levy. It is the
    // household bill that is the same for every household in the country,
    // which makes it the one worked example of a `bill` that needs no
    // qualification: an amount known in advance, arriving on a known cycle.
    //
    // 335.00 a year is the rate set by the Federal Council, unchanged since
    // 2021. It drops to 312.00 on 1 January 2027 and is due to fall again
    // after that, so this line has a date on it — see bakom.admin.ch/de/abgabe.
    // A seeded figure is a starting point the user overwrites, not a promise.
    { key: 'serafe', type: 'bill', sortOrder: 40, categoryKey: 'cat.insuranceTaxes', amount: '27.92', targetAmount: '335.00', periodMonths: 12 },
    // And the worked example of a `purchase`: a thing that wears out rather
    // than a bill that arrives. 1'512 over seven years is exactly 18.00 a
    // month, which is the point of the odd-looking price — a round monthly
    // figure reads as a decision, and 17.86 reads as arithmetic.
    // A second bill, so the type does not read as "the radio levy and nothing
    // else". The GA is the Swiss annual bill most households recognise, and
    // unlike Serafe it is one you choose — which is the more common shape.
    //
    // 3'995 is the adult second-class fare. Like every figure here it is a
    // starting point the user overwrites, and it moves; 332.92 a month is
    // what follows from it.
    { key: 'travelPass', type: 'bill', sortOrder: 50, categoryKey: 'cat.living', amount: '332.92', targetAmount: '3995.00', periodMonths: 12 },
    { key: 'laptop', type: 'purchase', sortOrder: 40, categoryKey: 'cat.living', amount: '18.00', targetAmount: '1512.00', periodMonths: 84 },
    // Savings, not expense. Until v7 there was no type that meant "leaves the
    // account without leaving your net worth", so these two were seeded as
    // expenses and the budget claimed a household consumed its own 3a
    // contributions. The type exists now and they take it.
    { key: 'savings', type: 'savings', sortOrder: 10, categoryKey: 'cat.savings', amount: '500.00' },
    // Pillar 3a is budgeted like any other set-aside: the money leaves the
    // spending plan but stays yours. 588.00 is the 2026 employee cap (7'056)
    // spread over twelve months — a starting point, not a rule.
    { key: 'pillar3a', type: 'savings', sortOrder: 20, categoryKey: 'cat.savings', amount: '588.00' },
  ]
}

/**
 * Writes the starter budget, named in the given language.
 *
 * The names are written in once and are the user's from then on — editing one
 * sticks, and switching language later leaves them alone. That is the whole
 * reason they are data here rather than slugs resolved at render.
 */
/**
 * @param anchorMonth `YYYY-MM`, the month the seeded reserves are anchored to.
 *   Required now that the defaults include a bill and a purchase, and passed
 *   in rather than read from a clock — the engine deliberately does not know
 *   what day it is, which is what makes every one of these tests repeatable.
 */
export function seedDefaults(vault: VaultData, locale: Locale = 'en', anchorMonth = '2026-01'): void {
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
      anchorMonth,
      targetAmount: d.targetAmount,
      periodMonths: d.periodMonths,
    })
    setPlanned(vault, entry.id, d.amount)
  }
}


/**
 * The other starter budget: a household shared by two people.
 *
 * Written for the shared-budgets walkthrough, and it is a different budget
 * rather than the same one with two salaries in it, because a household plan
 * is not a personal plan with company. Two things distinguish it, and the tour
 * exists to say both:
 *
 * **Only what is actually shared.** Rent, the utilities, the food, the radio
 * levy, the machine in the kitchen — costs that arrive once for the dwelling
 * rather than once per person. The health insurance premium and the 3a payment
 * are missing on purpose. They are per-person by law, not by preference, and a
 * household budget that swallows them is the first step towards a couple who
 * can no longer say what either of them owns. The tour does not stop to say
 * so; the example simply does not contain them.
 *
 * **The income side is contributions, not wages.** Nobody's salary is paid
 * into a household; each person pays a share of it in. So the two income lines
 * are what Alex and Sam put in, and they add up to exactly what goes out —
 * 2'337.92 either way. The split is 60/40, which is what proportional-to-income
 * gives for this pair, and the odd rappen are the honest consequence of that
 * rather than something to round away.
 *
 * The figures themselves are the same BFS household ones `bfsDefaults` uses,
 * unchanged. That survey already measures a *household* of about two people,
 * so no figure here has been doubled, invented or adjusted for a couple —
 * which is what keeps this example as sourced as the other one.
 *
 * @param anchorMonth `YYYY-MM`, for the two reserves. See `seedDefaults`.
 */
export function seedSharedDefaults(
  vault: VaultData,
  locale: Locale = 'en',
  anchorMonth = '2026-01',
): void {
  if (vault.budget.entries.length > 0) return

  const name = seedNamesFor(locale)

  for (const dc of sharedDefaultCategories()) {
    createCategory(vault, name[dc.key], dc.type, dc.sortOrder)
  }

  for (const d of sharedDefaults()) {
    const entry = createEntry(vault, {
      name: name[d.key],
      type: d.type,
      categoryName: name[d.categoryKey],
      sortOrder: d.sortOrder,
      anchorMonth,
      targetAmount: d.targetAmount,
      periodMonths: d.periodMonths,
    })
    setPlanned(vault, entry.id, d.amount)
  }
}

function sharedDefaultCategories(): DefaultCategory[] {
  return [
    { key: 'cat.contributions', type: 'income', sortOrder: 1 },
    { key: 'cat.housing', type: 'expense', sortOrder: 10 },
    { key: 'cat.living', type: 'expense', sortOrder: 20 },
    { key: 'cat.savings', type: 'expense', sortOrder: 30 },
  ]
}

function sharedDefaults(): DefaultEntry[] {
  return [
    // 60/40 of 2'327.92. Not halves: the two earn differently, and splitting a
    // shared cost in half when the incomes are not equal is the thing the
    // proportional arrangement exists to avoid.
    { key: 'contributionAlex', type: 'income', sortOrder: 10, categoryKey: 'cat.contributions', amount: '1402.75' },
    { key: 'contributionSam', type: 'income', sortOrder: 20, categoryKey: 'cat.contributions', amount: '935.17' },

    { key: 'rent', type: 'expense', sortOrder: 10, categoryKey: 'cat.housing', amount: '1350.00' },
    { key: 'utilities', type: 'expense', sortOrder: 20, categoryKey: 'cat.housing', amount: '150.00' },
    // Serafe sits under Housing here rather than under Insurance and Taxes,
    // where the personal starter puts it. The levy is charged per *dwelling*,
    // which is exactly why it belongs in a shared budget at all — and the
    // household plan has no insurance heading, because insurance is not shared.
    { key: 'serafe', type: 'bill', sortOrder: 30, categoryKey: 'cat.housing', amount: '27.92', targetAmount: '335.00', periodMonths: 12 },

    { key: 'groceries', type: 'expense', sortOrder: 10, categoryKey: 'cat.living', amount: '500.00' },

    // A shared set-aside, so the example has somewhere for a joint decision to
    // land — a holiday, the excess on something that breaks.
    { key: 'jointReserve', type: 'savings', sortOrder: 10, categoryKey: 'cat.savings', amount: '300.00' },
    // And a `purchase`, so the step saying a household has the same entry
    // types as a personal budget is backed by a screen that shows them. An
    // appliance is the household case for the type: one machine for the flat,
    // replaced every so often, rather than a bill that arrives. 1'200 over ten
    // years is exactly 10.00 a month — a round figure reads as a decision, and
    // the user overwrites it either way.
    { key: 'washingMachine', type: 'purchase', sortOrder: 20, categoryKey: 'cat.savings', amount: '10.00', targetAmount: '1200.00', periodMonths: 120 },
  ]
}
