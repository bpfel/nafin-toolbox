import { describe, test, expect } from 'vitest'
import { createEmptyVault, type VaultData } from '../crypto/vault'
import * as budget from './budgetEngine'
import { buildMonthSnapshot, closeMonth } from '../belege/belegeEngine'
import { planVersions, changesAfter } from './versions'

function plan(): VaultData {
  const v = createEmptyVault('Main')
  budget.seedDefaults(v, 'en', '2026-01')
  v.budget.openMonth = '2026-06'
  return v
}

const salary = (v: VaultData) => v.budget.entries.find(e => e.type === 'income')!
const close = (v: VaultData, month: string) => closeMonth(v, month, { ...buildMonthSnapshot(v, month), createdAt: `${month}-28T12:00:00Z` })

/**
 * Budget steps back through versions of the plan, not through months: months
 * that changed nothing are one step, and the plan now joins the latest of them
 * when it has not changed since.
 */
describe('the plan’s versions', () => {
  test('a plan with no months behind it is one version: now', () => {
    const versions = planVersions(plan())
    expect(versions).toHaveLength(1)
    expect(versions[0]).toMatchObject({ to: null, copy: null, from: '2026-06' })
  })

  test('months that changed nothing are one version, and the plan now joins them', () => {
    const v = plan()
    for (const m of ['2026-06', '2026-07', '2026-08']) close(v, m)

    const versions = planVersions(v)

    expect(versions).toHaveLength(1)
    expect(versions[0]).toMatchObject({ from: '2026-06', to: null, copy: null })
  })

  test('a raise in September: before it, and since', () => {
    const v = plan()
    close(v, '2026-07')
    close(v, '2026-08')
    budget.setPlanned(v, salary(v).id, '6400.00')
    close(v, '2026-09')

    const [now, before] = planVersions(v)

    expect(now).toMatchObject({ from: '2026-09', to: null, copy: null })
    expect(before).toMatchObject({ from: '2026-07', to: '2026-08' })
    expect(before.copy!.month).toBe('2026-08')
    expect(before.copy!.lines.find(l => l.entryId === salary(v).id)?.plannedAmount).not.toBe('6400.00')
  })

  test('a change this month is a version of its own, after the last copy', () => {
    const v = plan()
    close(v, '2026-09')
    budget.setPlanned(v, salary(v).id, '7000.00')

    const [now, before] = planVersions(v)

    expect(now).toMatchObject({ from: '2026-10', to: null, copy: null })
    expect(before).toMatchObject({ from: '2026-09', to: '2026-09' })
  })

  // Instead of a name somebody would have to type: what came next. The plan
  // now has nothing after it, and stays clean.
  test('a past version says what changed after it, and from when; the plan now says nothing', () => {
    const v = plan()
    close(v, '2026-08')
    budget.setPlanned(v, salary(v).id, '6400.00')
    close(v, '2026-09')

    const versions = planVersions(v)

    expect(changesAfter(versions, 0)).toEqual({ changes: [] })
    expect(changesAfter(versions, 1)).toEqual({
      from: '2026-09',
      changes: [expect.objectContaining({ kind: 'amount', name: salary(v).name, to: '6400.00' })],
    })
  })

  // Today's budget filed under March 2025 for a backdated receipt is not a
  // version the budget ever had.
  test('a backdated copy is no version', () => {
    const v = plan()
    close(v, '2026-08')
    budget.setPlanned(v, salary(v).id, '6400.00')
    close(v, '2026-09')
    close(v, '2025-03')
    expect(v.budget.snapshots.find(s => s.month === '2025-03')?.backdated).toBe(true)

    const versions = planVersions(v)

    expect(versions.map(x => x.from)).toEqual(['2026-09', '2026-08'])
  })

  // Gym archived mid-October, with a receipt from the 2nd: October's copy
  // carries it for Belege, but the budget lost it in October, not November.
  test('a line kept only for its records is not part of the version', () => {
    const v = plan()
    close(v, '2026-09')
    const gym = v.budget.entries.find(e => e.type === 'expense' && !e.automatic)!
    v.belege.push({ id: 'b', date: '2026-10-02', amount: '60.00', entryId: gym.id, createdBy: '1', createdAt: 'z' })
    budget.updateEntry(v, gym.id, { archived: true })
    close(v, '2026-10')

    const versions = planVersions(v)

    expect(versions.map(x => [x.from, x.to])).toEqual([['2026-10', null], ['2026-09', '2026-09']])
    expect(versions[0].lines.some(l => l.entryId === gym.id)).toBe(false)
    expect(changesAfter(versions, 1).changes).toEqual([expect.objectContaining({ kind: 'removed', name: gym.name })])
  })

  test('a month with no budget in it is no version', () => {
    const v = plan()
    close(v, '2026-08')
    v.budget.snapshots.push({ id: 'empty', createdAt: 'z', month: '2026-09', lines: [] })

    expect(planVersions(v)).toHaveLength(1)
  })
})

/**
 * An earlier version is shown with the budget's own summary and table, so its
 * figures have to come out exactly as the live plan's would.
 */
describe('a version read as the budget reads the plan', () => {
  test('a copy of an unchanged plan adds up exactly as the plan does, years included', () => {
    const v = plan()
    const live = budget.getPlanSummary(v)
    const copied = budget.planSummaryOf(buildMonthSnapshot(v, '2026-09').lines)

    for (const key of ['totalPlannedIncome', 'totalPlannedExpenses', 'totalPlannedSavings', 'plannedBalance', 'yearlyIncome', 'yearlyExpenses', 'yearlySavings', 'yearlyBalance'] as const) {
      expect(copied[key], key).toBe(live[key])
    }
    // Line by line; a copy lists them in the budget's order, category first.
    const yearOf = (entries: { entryId: string; yearlyAmount: string }[]) =>
      Object.fromEntries(entries.map(e => [e.entryId, e.yearlyAmount]))
    expect(yearOf(copied.entries)).toEqual(yearOf(live.entries))
  })
})
