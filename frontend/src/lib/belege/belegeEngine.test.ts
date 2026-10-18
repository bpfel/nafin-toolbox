import { describe, test, expect } from 'vitest'
import { createEmptyVault, type VaultData } from '../crypto/vault'
import * as budget from '../budget/budgetEngine'
import {
  addBeleg, addSettlement, balances, belegeIn, buildMonthSnapshot, closeMonth, editBeleg, monthCopy,
  monthsToClose, nextMonth, recentEntries, reviewMonth, reviewableMonths, settleUp, sharesFor, splitRappen,
  startMonths,
  spendableEntries, thisMonth, today, JOINT,
} from './belegeEngine'

function vault(): VaultData {
  const v = createEmptyVault('Main')
  budget.seedDefaults(v, 'en', '2026-01')
  return v
}

const anyExpense = (v: VaultData, n = 0) => spendableEntries(v)[n]

describe('records', () => {
  test('an entry that is not an expense, or is gone, is Unassigned', () => {
    const v = vault()
    const income = v.budget.entries.find(e => e.type === 'income')!

    expect(addBeleg(v, { date: '2026-10-01', amount: '5', entryId: income.id, createdBy: '1' }).entryId).toBeNull()
    expect(addBeleg(v, { date: '2026-10-01', amount: '5', entryId: 'gone', createdBy: '1' }).entryId).toBeNull()
  })

  test('amounts are kept normalised', () => {
    const v = vault()
    expect(addBeleg(v, { date: '2026-10-01', amount: "1'234,5", entryId: null, createdBy: '1' }).amount).toBe('1234.50')
  })

  test('deleting an entry leaves its records, as Unassigned', () => {
    const v = vault()
    const entry = anyExpense(v)
    const beleg = addBeleg(v, { date: '2026-10-01', amount: '5', entryId: entry.id, createdBy: '1' })

    budget.deleteEntry(v, entry.id)

    expect(v.belege).toHaveLength(1)
    expect(v.belege[0].id).toBe(beleg.id)
    expect(v.belege[0].entryId).toBeNull()
  })

  test('an empty note is removed rather than kept as blank', () => {
    const v = vault()
    const beleg = addBeleg(v, { date: '2026-10-01', amount: '5', entryId: null, note: 'Coop', createdBy: '1' })
    editBeleg(v, beleg.id, { note: '  ' })
    expect(v.belege[0].note).toBeUndefined()
  })
})

describe('the entry a record is counted against', () => {
  // The walking default is one's own last entry; the chips the few before it.
  test('is this person’s most recently entered, without repeats', async () => {
    const v = vault()
    const [a, b, c] = [anyExpense(v, 0), anyExpense(v, 1), anyExpense(v, 2)]
    const add = (entryId: string, createdBy: string, createdAt: string) =>
      v.belege.push({ id: createdAt, date: '2026-10-01', amount: '1.00', entryId, createdBy, createdAt })
    add(a.id, '1', '2026-10-01T08:00:00Z')
    add(b.id, '1', '2026-10-02T08:00:00Z')
    add(a.id, '1', '2026-10-03T08:00:00Z')
    add(c.id, '2', '2026-10-04T08:00:00Z')

    expect(recentEntries(v, '1')).toEqual([a.id, b.id])
    expect(recentEntries(v, '2')).toEqual([c.id])
  })

  test('skips archived entries', () => {
    const v = vault()
    const a = anyExpense(v)
    v.belege.push({ id: 'x', date: '2026-10-01', amount: '1.00', entryId: a.id, createdBy: '1', createdAt: 'z' })
    a.archived = true
    expect(recentEntries(v, '1')).toEqual([])
  })
})

describe('closing a month', () => {
  const copy = (stamp = 'now') => ({ id: stamp, month: '2026-01', createdAt: stamp, lines: [] })

  test('from the month being recorded up to this one, and any earlier month a record was backdated into', () => {
    const v = vault()
    v.budget.openMonth = '2026-09'
    addBeleg(v, { date: '2026-07-10', amount: '1', entryId: null, createdBy: '1' })

    expect(monthsToClose(v, '2026-11')).toEqual(['2026-07', '2026-09', '2026-10'])

    closeMonth(v, '2026-09', buildMonthSnapshot(v, '2026-09'))
    expect(monthsToClose(v, '2026-11')).toEqual(['2026-07', '2026-10'])
  })

  // No history is invented: a new plan starts recording the month it is made.
  test('a plan records months from when it was made, not before', () => {
    const v = vault()
    expect(v.budget.openMonth).toBe(thisMonth())
    expect(monthsToClose(v, thisMonth())).toEqual([])
  })

  test('a plan without a month being recorded starts from the one it is told, once', () => {
    const v = vault()
    delete v.budget.openMonth
    expect(monthsToClose(v, '2026-11')).toEqual([])
    startMonths(v, '2026-11')
    startMonths(v, '2026-08')
    expect(v.budget.openMonth).toBe('2026-11')
  })

  test('the first copy kept stays, and the month after it becomes the one recorded', () => {
    const v = vault()
    v.budget.openMonth = '2026-09'
    closeMonth(v, '2026-09', copy('first'))
    closeMonth(v, '2026-09', copy('second'))

    expect(monthCopy(v, '2026-09')!.createdAt).toBe('first')
    expect(v.budget.snapshots.filter(s => s.month === '2026-09')).toHaveLength(1)
    expect(v.budget.openMonth).toBe('2026-10')
  })

  test('a month backdated into does not move the month being recorded back', () => {
    const v = vault()
    v.budget.openMonth = '2026-10'
    closeMonth(v, '2026-07', copy())
    expect(v.budget.openMonth).toBe('2026-10')
  })

  test('a month’s copy is the whole plan, every type, by id', () => {
    const v = vault()
    const lines = buildMonthSnapshot(v, '2026-10').lines
    expect(new Set(lines.map(l => l.type))).toEqual(new Set(['income', 'expense', 'savings', 'bill', 'purchase']))
    expect(lines.every(l => l.entryId !== undefined)).toBe(true)
  })

  test('it carries an archived line only if the month’s records point at it', () => {
    const v = vault()
    const archived = anyExpense(v, 1)
    archived.archived = true
    expect(buildMonthSnapshot(v, '2026-10').lines.some(l => l.entryId === archived.id)).toBe(false)

    v.belege.push({ id: 'b', date: '2026-10-02', amount: '1.00', entryId: archived.id, createdBy: '1', createdAt: 'z' })
    expect(buildMonthSnapshot(v, '2026-10').lines.some(l => l.entryId === archived.id)).toBe(true)
  })

  test('a closed month reads against its copy, whatever the budget does after', () => {
    const v = vault()
    const rent = anyExpense(v)
    const nameThen = rent.name
    budget.setPlanned(v, rent.id, '1500.00')
    addBeleg(v, { date: '2026-10-01', amount: '1500', entryId: rent.id, createdBy: '1' })
    closeMonth(v, '2026-10', buildMonthSnapshot(v, '2026-10'))

    budget.setPlanned(v, rent.id, '1800.00')
    budget.updateEntry(v, rent.id, { name: 'Miete' })

    const row = reviewMonth(v, '2026-10').rows.find(r => r.entryId === rent.id)!
    expect(row.planned).toBe(150000)
    expect(row.entryName).toBe(nameThen)
  })

  test('Belege reads only the expense lines of a month’s copy', () => {
    const v = vault()
    closeMonth(v, '2026-09', buildMonthSnapshot(v, '2026-09'))
    const salary = v.budget.entries.find(e => e.type === 'income')!
    expect(reviewMonth(v, '2026-09').rows.some(r => r.entryId === salary.id)).toBe(false)
  })

  test('a record backdated against an entry made after the month closed gets a row of its own, unplanned', () => {
    const v = vault()
    closeMonth(v, '2026-09', copy())
    const later = budget.createEntry(v, { name: 'Dentist', type: 'expense', categoryName: 'Health' })
    addBeleg(v, { date: '2026-09-15', amount: '200', entryId: later.id, createdBy: '1' })

    const row = reviewMonth(v, '2026-09').rows.find(r => r.entryId === later.id)!
    expect(row.planned).toBeNull()
    expect(row.spent).toBe(20000)
  })

  test('the month after December is January', () => {
    expect(nextMonth('2026-12')).toBe('2027-01')
    expect(nextMonth('2026-09')).toBe('2026-10')
  })
})

describe('the copies months keep', () => {
  test('carry no name: a month is called by its month', () => {
    const v = vault()
    closeMonth(v, '2026-09', buildMonthSnapshot(v, '2026-09'))
    expect(Object.keys(monthCopy(v, '2026-09')!)).not.toContain('name')
  })
})

describe('a month against the budget', () => {
  test('per entry, Unassigned apart, and totals over both', () => {
    const v = vault()
    for (const e of v.budget.entries) delete e.automatic
    const [a, b] = [anyExpense(v, 0), anyExpense(v, 1)]
    budget.setPlanned(v, a.id, '100.00')
    addBeleg(v, { date: '2026-10-01', amount: '30', entryId: a.id, createdBy: '1' })
    addBeleg(v, { date: '2026-10-02', amount: '20', entryId: a.id, createdBy: '1' })
    addBeleg(v, { date: '2026-10-03', amount: '7.50', entryId: null, createdBy: '1' })
    addBeleg(v, { date: '2026-09-03', amount: '999', entryId: b.id, createdBy: '1' })

    const review = reviewMonth(v, '2026-10')
    const row = review.rows.find(r => r.entryId === a.id)!
    expect(row.spent).toBe(5000)
    expect(row.belege).toHaveLength(2)
    expect(review.unassigned.spent).toBe(750)
    expect(review.spent).toBe(5750)
    expect(review.closedAt).toBeNull()
  })

  test('a line with nothing planned and nothing spent is left out', () => {
    const v = vault()
    const entry = anyExpense(v)
    budget.setPlanned(v, entry.id, '0.00')
    expect(reviewMonth(v, '2026-10').rows.some(r => r.entryId === entry.id)).toBe(false)
  })

  test('months that have records, and this one, newest first', () => {
    const v = vault()
    addBeleg(v, { date: '2026-08-01', amount: '1', entryId: null, createdBy: '1' })
    expect(reviewableMonths(v, '2026-10')).toEqual(['2026-10', '2026-08'])
  })

  test('records of a month are those dated in it', () => {
    const v = vault()
    addBeleg(v, { date: '2026-10-31', amount: '1', entryId: null, createdBy: '1' })
    addBeleg(v, { date: '2026-11-01', amount: '1', entryId: null, createdBy: '1' })
    expect(belegeIn(v, '2026-10')).toHaveLength(1)
  })
})

describe('splitting in rappen', () => {
  test('adds up exactly; the leftover rappen go to the payer', () => {
    expect(splitRappen(1000, { a: 1, b: 1, c: 1 }, 'b')).toEqual({ a: 333, b: 334, c: 333 })
  })

  test('by weight', () => {
    expect(splitRappen(10000, { a: 60, b: 40 }, 'a')).toEqual({ a: 6000, b: 4000 })
  })

  test('a payer without a share does not take the leftover', () => {
    const parts = splitRappen(100, { a: 1, b: 2 }, JOINT)
    expect(parts.a + parts.b).toBe(100)
  })

  test('equal is one each, for the members there are now', () => {
    expect(sharesFor({ mode: 'equal' }, ['1', '2'])).toEqual({ '1': 1, '2': 1 })
    expect(sharesFor({ mode: 'shares', shares: { '1': 70, '2': 30 } }, ['1', '2', '3'])).toEqual({ '1': 70, '2': 30, '3': 0 })
  })
})

describe('who owes whom', () => {
  function household() {
    const v = vault()
    const shares = { '1': 1, '2': 1 }
    addBeleg(v, { date: '2026-10-01', amount: '100', entryId: null, paidBy: '1', shares, createdBy: '1' })
    addBeleg(v, { date: '2026-10-02', amount: '40', entryId: null, paidBy: '2', shares, createdBy: '2' })
    return v
  }

  test('paid, share and balance', () => {
    const b = balances(household())
    expect(b['1']).toEqual({ paid: 10000, share: 7000, balance: 3000 })
    expect(b['2']).toEqual({ paid: 4000, share: 7000, balance: -3000 })
  })

  test('the joint account changes nobody’s balance', () => {
    const v = household()
    addBeleg(v, { date: '2026-10-03', amount: '500', entryId: null, paidBy: JOINT, shares: { '1': 1, '2': 1 }, createdBy: '1' })
    expect(balances(v)['1'].balance).toBe(3000)
  })

  test('settling up proposes one transfer for two people, and recording it evens them out', () => {
    const v = household()
    const transfers = settleUp(balances(v))
    expect(transfers).toEqual([{ from: '2', to: '1', amount: 3000 }])

    addSettlement(v, { date: '2026-10-05', from: '2', to: '1', amount: '30', createdBy: '2' })
    expect(settleUp(balances(v))).toEqual([])
  })

  test('the fewest transfers between three', () => {
    const transfers = settleUp({
      a: { paid: 0, share: 0, balance: 6000 },
      b: { paid: 0, share: 0, balance: -4000 },
      c: { paid: 0, share: 0, balance: -2000 },
    })
    expect(transfers).toEqual([{ from: 'b', to: 'a', amount: 4000 }, { from: 'c', to: 'a', amount: 2000 }])
  })

  test('a balance runs on across months', () => {
    const v = household()
    addBeleg(v, { date: '2026-11-01', amount: '20', entryId: null, paidBy: '1', shares: { '1': 1, '2': 1 }, createdBy: '1' })
    expect(balances(v, '2026-10')['1'].balance).toBe(3000)
    expect(balances(v)['1'].balance).toBe(4000)
  })
})

describe('the calendar', () => {
  test('is the local one', () => {
    const late = new Date(2026, 9, 31, 23, 30)
    expect(thisMonth(late)).toBe('2026-10')
    expect(today(late)).toBe('2026-10-31')
  })
})


/**
 * Lines paid without a receipt — rent, health insurance — are not offered for
 * a record, and a month counts them as paid at their plan, so its total is the
 * whole month and not only the receipted part.
 */
describe('lines paid automatically', () => {
  test('the starter budget marks the usual standing orders', () => {
    const v = vault()
    const marked = v.budget.entries.filter(e => e.automatic).map(e => e.name)
    expect(marked).toContain('Rent')
    expect(v.budget.entries.find(e => e.name === 'Groceries')?.automatic).toBeUndefined()
  })

  test('are not offered for a record', () => {
    const v = vault()
    const rent = v.budget.entries.find(e => e.name === 'Rent')!
    expect(spendableEntries(v).some(e => e.id === rent.id)).toBe(false)
  })

  test('count as spent at their plan, in the line and in the total', () => {
    const v = vault()
    for (const e of v.budget.entries) delete e.automatic
    const rent = v.budget.entries.find(e => e.name === 'Rent')!
    const before = reviewMonth(v, '2026-10').spent
    budget.setAutomatic(v, rent.id, true)

    const review = reviewMonth(v, '2026-10')
    const row = review.rows.find(r => r.entryId === rent.id)!
    expect(row.automatic).toBe(true)
    expect(row.spent).toBe(row.planned)
    expect(review.spent).toBe(before + row.planned!)
  })

  test('a closed month keeps the mark it ended with', () => {
    const v = vault()
    const rent = v.budget.entries.find(e => e.name === 'Rent')!
    addBeleg(v, { date: '2026-09-01', amount: '1', entryId: null, createdBy: '1' })
    closeMonth(v, '2026-09', buildMonthSnapshot(v, '2026-09'))

    budget.setAutomatic(v, rent.id, false)

    expect(reviewMonth(v, '2026-09').rows.find(r => r.entryId === rent.id)?.automatic).toBe(true)
  })
})
