import { describe, test, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/svelte'
import { createEmptyVault } from '../../lib/crypto/vault'
import * as budget from '../../lib/budget/budgetEngine'
import { buildMonthSnapshot } from '../../lib/belege/belegeEngine'
import SnapshotEditor from './SnapshotEditor.svelte'

afterEach(cleanup)

const chf = (n: string) => Number(n).toLocaleString('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function seededSnapshot() {
  const v = createEmptyVault('Main')
  budget.seedDefaults(v, 'en', '2026-01')
  return { vault: v, snapshot: buildMonthSnapshot(v, '2026-09') }
}

/**
 * A snapshot showed only income and expense lines, and called income minus
 * expenses its savings: savings, bills and purchases were stored and never
 * shown or counted. It reads like the budget it was taken from now.
 */
describe('a snapshot', () => {
  test('adds up as the budget it was taken from does', () => {
    const { vault, snapshot } = seededSnapshot()
    const plan = budget.getPlanSummary(vault)
    const totals = budget.snapshotTotals(snapshot)

    expect(totals.income).toBe(plan.totalPlannedIncome)
    expect(totals.expenses).toBe(plan.totalPlannedExpenses)
    expect(totals.savings).toBe(plan.totalPlannedSavings)
    expect(totals.unallocated).toBe(plan.plannedBalance)
  })

  test('shows a line of every type, savings, bills and purchases included', () => {
    const { snapshot } = seededSnapshot()
    render(SnapshotEditor, { snapshot })

    const shown = [...document.querySelectorAll('.line-name')].map(cell => cell.textContent)
    for (const type of ['income', 'expense', 'savings', 'bill', 'purchase'] as const) {
      const line = snapshot.lines.find(l => l.type === type)!
      expect(shown, type).toContain(line.entryName)
    }
    expect(shown).toHaveLength(snapshot.lines.length)
  })

  test('says what it adds up to: income, expenses, savings and unallocated', () => {
    const { snapshot } = seededSnapshot()
    const totals = budget.snapshotTotals(snapshot)
    render(SnapshotEditor, { snapshot })

    const foot = document.querySelector('tfoot')!
    expect(foot.textContent).toContain('Unallocated')
    expect(foot.textContent).toContain(chf(totals.savings))
    expect(foot.textContent).toContain(chf(totals.unallocated))
  })
})
