import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/svelte'
import userEvent from '@testing-library/user-event'
import { createEmptyVault, type VaultData } from '../../lib/crypto/vault'
import * as budget from '../../lib/budget/budgetEngine'
import { addBeleg } from '../../lib/belege/belegeEngine'

vi.mock('../../lib/crypto/vaultStore.svelte', () => ({ belegUnsaved: () => false }))

import JournalView from './JournalView.svelte'

let vault: VaultData

beforeEach(() => {
  const raw = createEmptyVault('Main')
  budget.seedDefaults(raw, 'en', '2026-01')
  const g = raw.budget.entries.find(e => e.name === 'Food & Groceries')!
  const d = raw.budget.entries.find(e => e.name === 'Dining Out')!
  addBeleg(raw, { date: '2026-06-03', amount: '12.40', entryId: g.id, note: 'Coop', createdBy: '1' })
  addBeleg(raw, { date: '2026-09-14', amount: '48.00', entryId: d.id, note: 'Pizza', createdBy: '1' })
  addBeleg(raw, { date: '2026-10-02', amount: '7.50', entryId: null, note: 'Kiosk', createdBy: '1' })
  addBeleg(raw, { date: '2026-10-05', amount: '63.20', entryId: g.id, note: 'Migros', createdBy: '1' })
  const reactive = $state(raw)
  vault = reactive
})

afterEach(cleanup)

const show = (onopen?: () => void) => render(JournalView, { vault, onopen })

/**
 * Every receipt, all the way back, under month headings; searched by what a
 * person remembers, and filtered by category.
 */
describe('the journal', () => {
  test('goes all the way back, newest month first, each with its total', () => {
    show()
    const months = screen.getAllByRole('heading', { level: 3 }).map(h => h.textContent)
    expect(months[0]).toMatch(/October 2026/)
    expect(months.at(-1)).toMatch(/June 2026/)
    expect(months[0]).toMatch(/70\.70/)
  })

  test('finds a receipt by its note, and says how many and how much', async () => {
    show()
    await fireEvent.input(screen.getByRole('searchbox'), { target: { value: 'coop' } })

    expect(screen.getByText('Coop')).toBeTruthy()
    expect(screen.queryByText('Migros')).toBeNull()
    expect(screen.getByText(/1 receipt/)).toBeTruthy()
  })

  test('by amount, with a comma as readily as a point', async () => {
    show()
    await fireEvent.input(screen.getByRole('searchbox'), { target: { value: '63,2' } })
    expect(screen.getByText('Migros')).toBeTruthy()
    expect(screen.queryByText('Coop')).toBeNull()
  })

  test('filters to one category, or to Unassigned', async () => {
    show()
    const select = screen.getByLabelText('Category') as HTMLSelectElement
    const living = vault.budget.categories.find(c => c.id === vault.budget.entries.find(e => e.name === 'Food & Groceries')!.categoryId)!

    await userEvent.selectOptions(select, living.id)
    expect(screen.getByText('Coop')).toBeTruthy()
    expect(screen.queryByText('Pizza')).toBeNull()

    await userEvent.selectOptions(select, 'unassigned')
    expect(screen.getByText('Kiosk')).toBeTruthy()
    expect(screen.queryByText('Coop')).toBeNull()
  })

  test('says so when nothing matches', async () => {
    show()
    await fireEvent.input(screen.getByRole('searchbox'), { target: { value: 'zzz' } })
    expect(screen.getByText('Nothing matches.')).toBeTruthy()
  })

  // Looking up a receipt is not changing it: only edit mode opens one.
  test('is read-only unless edit mode is on', async () => {
    show()
    expect(within(screen.getByText('Coop').closest('.card')!).queryAllByRole('button')).toHaveLength(0)
    cleanup()

    const onopen = vi.fn()
    show(onopen)
    await userEvent.click(screen.getByText('Coop'))
    expect(onopen).toHaveBeenCalled()
  })
})
