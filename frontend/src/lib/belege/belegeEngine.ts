import type { Beleg, Settlement, Split, VaultCategory, VaultData, VaultEntry, VaultSnapshot, VaultSnapshotLine } from '../crypto/vault'
import { categoryRank, snapshotLine } from '../budget/budgetEngine'
import { newId, nowISO } from '../sync/source'
import { centsOf, normalizeAmount } from '../util/money'
import { nextMonth } from '../util/calendar'

/**
 * Belege: what was actually spent, and how a month went against the budget.
 *
 * Pure functions over the vault, like the budget and accounts engines. Every
 * write here is applied through the save queue as an action (see
 * `lib/sync/actions.ts`), so ids and times come from `newId`/`nowISO` and are
 * replayed, not drawn again, when an action is applied onto a newer vault.
 *
 * Amounts are strings in the vault, as everywhere; sums are done in rappen.
 */

/** The joint account as a payer: changes nobody's balance. */
export const JOINT = 'joint'

// --- records -----------------------------------------------------------------

export interface NewBeleg {
  date: string
  amount: string
  entryId: string | null
  note?: string
  paidBy?: string
  shares?: Record<string, number>
  createdBy: string
}

/** Only an expense entry that exists can be counted against; anything else is Unassigned. */
function countable(vault: VaultData, entryId: string | null): string | null {
  if (entryId === null) return null
  const entry = vault.budget.entries.find(e => e.id === entryId)
  return entry && entry.type === 'expense' ? entryId : null
}

/**
 * Add a record. An entry that is gone — deleted on another device before this
 * was saved — makes it Unassigned rather than refusing it: a record is money
 * somebody spent and typed in, and it is never thrown away.
 */
export function addBeleg(vault: VaultData, input: NewBeleg): Beleg {
  const note = input.note?.trim()
  const beleg: Beleg = {
    id: newId('beleg'),
    date: input.date,
    amount: normalizeAmount(input.amount),
    entryId: countable(vault, input.entryId),
    ...(note ? { note } : {}),
    ...(input.paidBy !== undefined ? { paidBy: input.paidBy } : {}),
    ...(input.shares !== undefined ? { shares: { ...input.shares } } : {}),
    createdBy: input.createdBy,
    createdAt: nowISO(),
  }
  vault.belege.push(beleg)
  return beleg
}

export type BelegPatch = Partial<Pick<Beleg, 'date' | 'amount' | 'entryId' | 'note' | 'paidBy'>>

export function editBeleg(vault: VaultData, id: string, patch: BelegPatch): void {
  const beleg = vault.belege.find(b => b.id === id)
  if (!beleg) return
  if (patch.date !== undefined) beleg.date = patch.date
  if (patch.amount !== undefined) beleg.amount = normalizeAmount(patch.amount)
  if (patch.entryId !== undefined) beleg.entryId = countable(vault, patch.entryId)
  if (patch.paidBy !== undefined) beleg.paidBy = patch.paidBy
  if (patch.note !== undefined) {
    const note = patch.note.trim()
    if (note) beleg.note = note
    else delete beleg.note
  }
}

export function deleteBeleg(vault: VaultData, id: string): void {
  vault.belege = vault.belege.filter(b => b.id !== id)
}

/**
 * What happens to a month's records when their entry is deleted: they become
 * Unassigned. Called by the budget's delete, so no record points at nothing.
 */
export function unassignRecordsOf(vault: VaultData, entryId: string): void {
  for (const beleg of vault.belege) if (beleg.entryId === entryId) beleg.entryId = null
}

/** Records of one month, `'YYYY-MM'`. */
export function belegeIn(vault: VaultData, month: string): Beleg[] {
  return vault.belege.filter(b => monthOf(b.date) === month)
}

/**
 * The budget line a record is counted against and its category, as they stand
 * now: neither for Unassigned or a line since deleted. Looked up in four places
 * before, two of them in one file.
 */
export function filedUnder(vault: VaultData, beleg: Beleg): { entry?: VaultEntry; category?: VaultCategory } {
  const entry = beleg.entryId === null ? undefined : vault.budget.entries.find(e => e.id === beleg.entryId)
  const category = entry && vault.budget.categories.find(c => c.id === entry.categoryId)
  return { entry, category }
}

/** How full a bar is: spent against planned, in whole percent, never past 100. */
export function spentShare(spent: number, planned: number | null): number {
  return planned && planned > 0 ? Math.min(100, Math.round((spent / planned) * 100)) : 0
}

export function monthOf(date: string): string {
  return date.slice(0, 7)
}

// --- choosing an entry -------------------------------------------------------

/**
 * What a record can be counted against: expense entries still in use, and not
 * paid automatically — nobody holds a receipt for the rent.
 */
export function spendableEntries(vault: VaultData): VaultEntry[] {
  return vault.budget.entries
    .filter(e => e.type === 'expense' && !e.archived && !e.automatic)
    .sort((a, b) => a.sortOrder - b.sortOrder)
}

/**
 * This person's most recently used entries, newest first, without repeats: the
 * first is the walking default, the next few are the chips. By when a record
 * was *entered*, so typing in last Tuesday's receipt still counts as the latest
 * use; and by this person only — one's own habits, not the partner's coffee.
 */
export function recentEntries(vault: VaultData, userId: string, count = 6): string[] {
  const usable = new Set(spendableEntries(vault).map(e => e.id))
  const seen: string[] = []
  const mine = vault.belege
    .filter(b => b.createdBy === userId && b.entryId !== null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  for (const beleg of mine) {
    const id = beleg.entryId!
    if (usable.has(id) && !seen.includes(id)) seen.push(id)
    if (seen.length === count) break
  }
  return seen
}

// --- closing a month ---------------------------------------------------------
//
// A finished month keeps a copy of the plan it ended with: a snapshot carrying
// its month, of the whole plan, every type. It is the plan's history for
// everybody, and the yardstick a month of Belege is read against — a past
// month read against today's plan would change its verdict every time the plan
// did. Taken by hand, a snapshot has no month; taken as a month ends, it does.

/** A month's copy of the plan, if it has one. */
export function monthCopy(vault: VaultData, month: string): VaultSnapshot | undefined {
  return vault.budget.snapshots.find(s => s.month === month)
}

/**
 * The plan as a month's lines: every entry in use, in the budget's order —
 * category, then entry — and any archived one the month's records point at.
 */
function monthLines(vault: VaultData, month: string): VaultSnapshotLine[] {
  const pointedAt = new Set(belegeIn(vault, month).map(b => b.entryId).filter((id): id is string => id !== null))
  const rank = categoryRank(vault)
  return vault.budget.entries
    .filter(e => !e.archived || pointedAt.has(e.id))
    .sort((a, b) => rank(a.categoryId) - rank(b.categoryId) || a.sortOrder - b.sortOrder)
    .map(e => (e.archived ? { ...snapshotLine(vault, e), archived: true as const } : snapshotLine(vault, e)))
}

/**
 * The copy a month ends with. A month from before the budget's history began
 * is one a record was backdated into: its copy is today's budget, and says so.
 */
export function buildMonthSnapshot(vault: VaultData, month: string): VaultSnapshot {
  const open = vault.budget.openMonth
  return {
    id: newId('snapshot'),
    createdAt: nowISO(),
    month,
    lines: monthLines(vault, month),
    ...(open && month < open ? { forBelegeOnly: true as const } : {}),
  }
}

/**
 * Keep a month's copy, and move on to the month after it. The first copy kept
 * stays: two devices closing October leave one.
 *
 * A month that ends with no budget and no records keeps nothing — the months
 * between signing up and starting a budget are not versions of it — but still
 * moves on. One with records keeps its copy even empty, or it would be found
 * unclosed again on every write.
 */
export function closeMonth(vault: VaultData, month: string, copy: VaultSnapshot): void {
  const keep = copy.lines.length > 0 || belegeIn(vault, month).length > 0
  if (keep && !monthCopy(vault, month)) vault.budget.snapshots.unshift({ ...copy, month })
  if (!vault.budget.openMonth || vault.budget.openMonth <= month) vault.budget.openMonth = nextMonth(month)
}

/** Start recording months from `month`, on the plan's first write. Never moved back. */
export function startMonths(vault: VaultData, month: string): void {
  vault.budget.openMonth ??= month
}

/**
 * Finished months without a copy yet, oldest first: every month from the one
 * being recorded up to the current one, and any earlier month a record has been
 * backdated into.
 *
 * Closing happens on the first write after a month ends — there is no server
 * job, and the server could not read the plan anyway. The plan can only change
 * through the app, so a copy taken by that first write is the plan as it stood
 * when the month ended, however late the write comes — and a month nobody wrote
 * in had the same plan as the one before it.
 */
export function monthsToClose(vault: VaultData, current: string): string[] {
  const months = new Set(vault.belege.map(b => monthOf(b.date)).filter(m => m < current))
  const open = vault.budget.openMonth
  if (open) for (let m = open; m < current; m = nextMonth(m)) months.add(m)
  return [...months].filter(m => !monthCopy(vault, m)).sort()
}

// --- settlements and the split -------------------------------------------------

export interface NewSettlement {
  date: string
  from: string
  to: string
  amount: string
  createdBy: string
}

export function addSettlement(vault: VaultData, input: NewSettlement): Settlement {
  const settlement: Settlement = {
    id: newId('settlement'),
    date: input.date,
    from: input.from,
    to: input.to,
    amount: normalizeAmount(input.amount),
    createdBy: input.createdBy,
    createdAt: nowISO(),
  }
  vault.settlements.push(settlement)
  return settlement
}

export function deleteSettlement(vault: VaultData, id: string): void {
  vault.settlements = vault.settlements.filter(s => s.id !== id)
}

export function setSplit(vault: VaultData, split: Split): void {
  vault.split = split.mode === 'equal' ? { mode: 'equal' } : { mode: 'shares', shares: { ...split.shares } }
}

/**
 * The weights a new record takes: the household's split, for the members it
 * has now. Equal is one each. Copied onto the record, so a later change to the
 * split does not rewrite records already entered.
 */
export function sharesFor(split: Split, members: string[]): Record<string, number> {
  if (split.mode === 'equal') return Object.fromEntries(members.map(m => [m, 1]))
  return Object.fromEntries(members.map(m => [m, split.shares[m] ?? 0]))
}

// --- money in rappen -----------------------------------------------------------

export function rappen(amount: string): number {
  return centsOf(amount)
}

/**
 * Each member's part of an amount, in rappen. Rounded down, and the rappen
 * left over go to the payer — or, if the payer has no share, to the largest
 * share — so the parts always add up to the amount exactly.
 */
export function splitRappen(total: number, shares: Record<string, number>, payer?: string): Record<string, number> {
  const members = Object.keys(shares).filter(m => shares[m] > 0)
  const weight = members.reduce((sum, m) => sum + shares[m], 0)
  if (weight === 0) return {}
  const parts: Record<string, number> = {}
  let given = 0
  for (const m of members) {
    parts[m] = Math.floor((total * shares[m]) / weight)
    given += parts[m]
  }
  const rest = total - given
  if (rest > 0) {
    const to = payer && payer in parts ? payer : members.sort((a, b) => shares[b] - shares[a] || a.localeCompare(b))[0]
    parts[to] += rest
  }
  return parts
}

export interface Balance {
  /** Paid out for the household, and settlements sent. */
  paid: number
  /** Their share of what was spent, and settlements received. */
  share: number
  /** Positive: the household owes them. Negative: they owe. */
  balance: number
}

/**
 * Who is owed what, in rappen, across every record and settlement — it runs
 * on from month to month, as Tricount's does, rather than starting again.
 * A record paid from the joint account changes nobody's balance.
 */
export function balances(vault: VaultData, upTo?: string): Record<string, Balance> {
  return tally(vault, month => upTo === undefined || month <= upTo)
}

/** The same, for one month alone: what that month added to everybody's balance. */
export function balancesIn(vault: VaultData, month: string): Record<string, Balance> {
  return tally(vault, m => m === month)
}

function tally(vault: VaultData, counts: (month: string) => boolean): Record<string, Balance> {
  const result: Record<string, Balance> = {}
  const of = (m: string) => (result[m] ??= { paid: 0, share: 0, balance: 0 })

  for (const beleg of vault.belege) {
    if (!counts(monthOf(beleg.date))) continue
    if (!beleg.paidBy || beleg.paidBy === JOINT || !beleg.shares) continue
    const total = rappen(beleg.amount)
    of(beleg.paidBy).paid += total
    for (const [m, part] of Object.entries(splitRappen(total, beleg.shares, beleg.paidBy))) of(m).share += part
  }
  for (const s of vault.settlements) {
    if (!counts(monthOf(s.date))) continue
    const total = rappen(s.amount)
    of(s.from).paid += total
    of(s.to).share += total
  }
  for (const b of Object.values(result)) b.balance = b.paid - b.share
  return result
}

export interface Transfer {
  from: string
  to: string
  /** Rappen. */
  amount: number
}

/**
 * The fewest transfers that even everybody out: the largest debtor pays the
 * largest creditor, again, until nobody is owed anything. One, for two people.
 */
export function settleUp(owed: Record<string, Balance>): Transfer[] {
  const debtors = Object.entries(owed).filter(([, b]) => b.balance < 0).map(([m, b]) => ({ m, left: -b.balance }))
  const creditors = Object.entries(owed).filter(([, b]) => b.balance > 0).map(([m, b]) => ({ m, left: b.balance }))
  const transfers: Transfer[] = []
  for (;;) {
    debtors.sort((a, b) => b.left - a.left || a.m.localeCompare(b.m))
    creditors.sort((a, b) => b.left - a.left || a.m.localeCompare(b.m))
    const debtor = debtors[0]
    const creditor = creditors[0]
    if (!debtor || !creditor || debtor.left === 0 || creditor.left === 0) break
    const amount = Math.min(debtor.left, creditor.left)
    transfers.push({ from: debtor.m, to: creditor.m, amount })
    debtor.left -= amount
    creditor.left -= amount
    if (debtor.left === 0) debtors.shift()
    if (creditor.left === 0) creditors.shift()
  }
  return transfers
}

// --- a month against its budget ------------------------------------------------

export interface ReviewRow {
  /** `null` for Unassigned. */
  entryId: string | null
  entryName: string
  categoryName: string
  /** Rappen. `null` where the month had no plan for it — a record against an entry made later. */
  planned: number | null
  /** Rappen. For a line paid automatically, its plan, as though receipted. */
  spent: number
  belege: Beleg[]
  /** Paid without receipts, and counted as paid at its plan. */
  automatic: boolean
}

export interface MonthReview {
  month: string
  /** The frozen copy's date, or `null` when read against the live plan. */
  closedAt: string | null
  rows: ReviewRow[]
  unassigned: ReviewRow
  planned: number
  spent: number
}

/**
 * A month against the budget it belongs to: its frozen copy once it is closed,
 * today's plan while it is the current month (or ended but not yet closed,
 * which only a reader sees).
 */
export function reviewMonth(vault: VaultData, month: string): MonthReview {
  const records = belegeIn(vault, month).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
  // What Belege reads: the expense lines, and any other a record points at.
  const pointedAt = new Set(records.map(b => b.entryId).filter((id): id is string => id !== null))
  const counts = (l: VaultSnapshotLine) => l.type === 'expense' || (l.entryId !== undefined && pointedAt.has(l.entryId))
  const closed = monthCopy(vault, month)
  const lines = (closed ? closed.lines : monthLines(vault, month)).filter(counts)

  // A line paid automatically starts out spent at its plan: the month's total
  // is then the whole month, not only the part that came with receipts.
  const rows: ReviewRow[] = lines.map(l => ({
    entryId: l.entryId ?? null,
    entryName: l.entryName,
    categoryName: l.categoryName,
    planned: rappen(l.plannedAmount),
    spent: l.automatic ? rappen(l.plannedAmount) : 0,
    belege: [],
    automatic: l.automatic === true,
  }))
  const byEntry = new Map(rows.filter(r => r.entryId !== null).map(r => [r.entryId, r]))
  const unassigned: ReviewRow = { entryId: null, entryName: '', categoryName: '', planned: null, spent: 0, belege: [], automatic: false }

  for (const beleg of records) {
    let row = beleg.entryId === null ? unassigned : byEntry.get(beleg.entryId)
    if (!row) {
      // Backdated into a closed month, against an entry made after it closed.
      const { entry, category } = filedUnder(vault, beleg)
      row = { entryId: beleg.entryId, entryName: entry?.name ?? '', categoryName: category?.name ?? '', planned: null, spent: 0, belege: [], automatic: false }
      rows.push(row)
      byEntry.set(beleg.entryId, row)
    }
    row.spent += rappen(beleg.amount)
    row.belege.push(beleg)
  }

  // A line nothing was planned for and nothing spent on says nothing.
  const shown = rows.filter(r => (r.planned ?? 0) > 0 || r.spent > 0)
  const all = [...shown, unassigned]
  return {
    month,
    closedAt: closed?.createdAt ?? null,
    rows: shown,
    unassigned,
    planned: shown.reduce((sum, r) => sum + (r.planned ?? 0), 0),
    spent: all.reduce((sum, r) => sum + r.spent, 0),
  }
}

/** Months that have records, newest first, with the current month always there. */
export function reviewableMonths(vault: VaultData, current: string): string[] {
  const months = new Set([current, ...vault.belege.map(b => monthOf(b.date))])
  return [...months].sort().reverse()
}
