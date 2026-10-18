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
  name: '',
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

  test('a named version shows its name, with its months beneath', async () => {
    withHistory([copy('2026-08', '5600.00', { name: 'Before the raise' }), copy('2026-09', '6000.00')])
    render(BudgetModule)

    await fireEvent.click(screen.getByRole('button', { name: 'Earlier version' }))

    expect(screen.getByRole('heading', { name: 'Before the raise' })).toBeTruthy()
    expect(screen.getByText('August 2026')).toBeTruthy()
  })

  test('a snapshot taken by hand back then is listed with that version', async () => {
    const handMade: VaultSnapshot = { ...copy('2026-08', '5600.00'), id: 'hand', name: 'Mid August', month: undefined, createdAt: '2026-08-15T10:00:00Z' }
    withHistory([copy('2026-08', '5600.00'), copy('2026-09', '6000.00'), handMade])
    render(BudgetModule)

    await fireEvent.click(screen.getByRole('button', { name: 'Earlier version' }))

    expect(screen.getByText('Also saved then')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Mid August' })).toBeTruthy()
  })
})
