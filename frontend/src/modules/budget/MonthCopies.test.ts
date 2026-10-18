import { cleanup, render, screen, within } from '@testing-library/svelte'
import userEvent from '@testing-library/user-event'
import { describe, test, expect, vi, afterEach } from 'vitest'
import { committingTo } from '../../lib/sync/testing'
import { createEmptyVault } from '../../lib/crypto/vault'
import * as engine from '../../lib/budget/budgetEngine'
import { addBeleg, buildMonthSnapshot, closeMonth } from '../../lib/belege/belegeEngine'

vi.mock('../../lib/crypto/vaultStore.svelte', async () => (await import('../../lib/sync/testing')).storeMock())

import SnapshotPanel from './SnapshotPanel.svelte'

afterEach(cleanup)

function withMonths() {
  const v = committingTo(createEmptyVault('Main'))
  engine.seedDefaults(v, 'en', '2026-01')
  const groceries = v.budget.entries.find(e => e.name === 'Food & Groceries')!
  addBeleg(v, { date: '2026-09-04', amount: '120.50', entryId: groceries.id, createdBy: '1' })
  closeMonth(v, '2026-08', buildMonthSnapshot(v, '2026-08'))
  closeMonth(v, '2026-09', buildMonthSnapshot(v, '2026-09'))
  engine.insertSnapshot(v, engine.buildSnapshot(v, 'Before the move'))
  return v
}

/**
 * The Archive keeps two kinds of copy: the ones taken by hand, named, on top;
 * and one per finished month, taken by the app, below — the plan's history,
 * and the plan Belege reads each month against.
 */
describe('the months in the archive', () => {
  let income = ''
  async function open() {
    const v = withMonths()
    income = v.budget.entries.find(e => e.type === 'income')!.name
    render(SnapshotPanel, { vault: v })
    await userEvent.click(screen.getByRole('button', { name: /Archive|Snapshots/i }))
  }

  test('are listed under the named snapshots, newest first', async () => {
    await open()
    const names = screen.getAllByRole('button', { expanded: false }).map(b => b.textContent?.trim())
    expect(names.indexOf('Before the move')).toBeLessThan(names.indexOf('September 2026'))
    expect(names.indexOf('September 2026')).toBeLessThan(names.indexOf('August 2026'))
  })

  test('a month with receipts shows what was spent; a month cannot be deleted', async () => {
    await open()
    const september = screen.getByText('September 2026').closest('li')!
    expect(within(september).getByText(/Spent/)).toBeTruthy()
    expect(within(september).queryByRole('button', { name: /Delete/ })).toBeNull()
  })

  test('opens to the whole plan, with a Spent column beside it', async () => {
    await open()
    await userEvent.click(screen.getByText('September 2026'))
    const september = screen.getByText('September 2026').closest('li')!
    expect(within(september).getByRole('columnheader', { name: 'Spent' })).toBeTruthy()
    expect(within(september).getByText(income)).toBeTruthy()
  })
})
