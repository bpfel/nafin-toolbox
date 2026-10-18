import { cleanup, render, screen, fireEvent } from '@testing-library/svelte'
import { describe, test, expect, afterEach } from 'vitest'
import type { VaultData, VaultSnapshot } from '../../lib/crypto/vault'

import { getVaultState } from '../../lib/crypto/vaultStore.svelte'
import BudgetModule from './BudgetModule.svelte'

const vaultState = getVaultState()

afterEach(cleanup)

const line = (entryId: string, name: string, type: 'income' | 'expense', category: string, amount: string) =>
  ({ entryId, entryName: name, categoryName: category, type, plannedAmount: amount })

const copy = (month: string, salary: string, extra: Partial<VaultSnapshot> = {}): VaultSnapshot => ({
  id: `copy-${month}`,
  createdAt: `${month}-28T12:00:00Z`,
  month,
  lines: [line('salary', 'Salary', 'income', 'Employment', salary), line('rent', 'Rent', 'expense', 'Housing', '1350.00')],
  ...extra,
})

/** A raise in September: July and August at 5'600, September and now at 6'000. */
function withHistory(snapshots: VaultSnapshot[]): void {
  vaultState.vault = {
    version: 11,
    tour: { completedAt: null, dismissedAt: null },
    trust: { pins: {}, epochs: {} },
    people: {},
    belege: [],
    settlements: [],
    split: { mode: 'equal' as const },
    accounts: [],
    budget: {
      categories: [
        { id: 'g-income', name: 'Employment', side: 'income', sortOrder: 10 },
        { id: 'g-housing', name: 'Housing', side: 'expense', sortOrder: 20 },
      ],
      entries: [
        { id: 'salary', name: 'Salary', type: 'income', sortOrder: 10, archived: false, categoryId: 'g-income', sourceAccountId: null, sinkAccountId: null },
        { id: 'rent', name: 'Rent', type: 'expense', sortOrder: 20, archived: false, categoryId: 'g-housing', sourceAccountId: null, sinkAccountId: null },
      ],
      plan: [
        { entryId: 'salary', plannedAmount: '6000.00' },
        { entryId: 'rent', plannedAmount: '1350.00' },
      ],
      snapshots,
      openMonth: '2026-10',
    },
  } as VaultData
}

/**
 * Budget steps back through versions of the plan: the plan now first, then
 * the one before each change — months that changed nothing are one step.
 */
describe('earlier versions of the plan', () => {
  test('a plan with no history has no stepper', () => {
    withHistory([])
    render(BudgetModule)
    expect(screen.queryByRole('button', { name: 'Earlier version' })).toBeNull()
  })

  test('one step back is the plan before the raise, for both months it held', async () => {
    withHistory([copy('2026-07', '5600.00'), copy('2026-08', '5600.00'), copy('2026-09', '6000.00')])
    let past = false
    render(BudgetModule, { get past() { return past }, set past(v) { past = v } })

    expect(screen.getByRole('heading', { name: 'Current plan' })).toBeTruthy()
    expect(screen.getByText('since September 2026')).toBeTruthy()

    await fireEvent.click(screen.getByRole('button', { name: 'Earlier version' }))

    expect(screen.getByRole('heading', { name: 'July 2026 – August 2026' })).toBeTruthy()
    expect(screen.getByText(/Read only/)).toBeTruthy()
    expect(document.querySelector('tfoot')!.textContent).toMatch(/5.600\.00/)
    // Nowhere further back to go.
    expect((screen.getByRole('button', { name: 'Earlier version' }) as HTMLButtonElement).disabled).toBe(true)
  })

  // What a step back would undo, worked out rather than typed in.
  test('a version says what changed from the one before it', async () => {
    withHistory([copy('2026-08', '5600.00'), copy('2026-09', '6000.00')])
    render(BudgetModule)

    expect(screen.getByRole('heading', { name: 'What changed from the version before' })).toBeTruthy()
    const changes = screen.getByRole('heading', { name: 'What changed from the version before' }).closest('section')!
    expect(changes.textContent).toMatch(/Salary/)
    expect(changes.textContent).toMatch(/5.600\.00 → 6.000\.00/)

    await fireEvent.click(screen.getByRole('button', { name: 'Earlier version' }))
    // The oldest has nothing before it.
    expect(screen.queryByRole('heading', { name: 'What changed from the version before' })).toBeNull()
  })

  // A move can touch a dozen lines; all of them are there, folded past six.
  test('a long list of changes folds, and opens to every one', async () => {
    const many = (amount: string) => copy('2026-08', amount)
    const before = many('5600.00')
    before.lines = Array.from({ length: 9 }, (_, i) => line(`e${i}`, `Line ${i}`, 'expense', 'Housing', '10.00'))
    withHistory([before])
    render(BudgetModule)
    const changes = screen.getByRole('heading', { name: 'What changed from the version before' }).closest('section')!

    expect(changes.querySelectorAll('li')).toHaveLength(6)
    await fireEvent.click(screen.getByRole('button', { name: /Show all \d+ changes/ }))
    expect(changes.querySelectorAll('li').length).toBeGreaterThan(6)
  })
})
