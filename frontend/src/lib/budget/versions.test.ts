import { describe, test, expect } from 'vitest'
import { createEmptyVault, type VaultData } from '../crypto/vault'
import * as budget from './budgetEngine'
import { buildMonthSnapshot, closeMonth } from '../belege/belegeEngine'
import { planVersions } from './versions'

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

  // Instead of a name somebody would have to type: what is different.
  test('each version says what changed from the one before; the oldest says nothing', () => {
    const v = plan()
    close(v, '2026-08')
    budget.setPlanned(v, salary(v).id, '6400.00')
    close(v, '2026-09')

    const [now, before] = planVersions(v)

    expect(now.changes).toEqual([
      expect.objectContaining({ kind: 'amount', name: salary(v).name, to: '6400.00' }),
    ])
    expect(before.changes).toEqual([])
  })
})
