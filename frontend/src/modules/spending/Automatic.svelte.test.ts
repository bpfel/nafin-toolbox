import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/svelte'
import userEvent from '@testing-library/user-event'
import { createEmptyVault, type VaultData } from '../../lib/crypto/vault'
import * as budget from '../../lib/budget/budgetEngine'

const store = vi.hoisted(() => ({ vault: null as VaultData | null }))

vi.mock('../../lib/crypto/vaultStore.svelte', async () => {
  const { committerFor } = await import('../../lib/sync/testing')
  return { commit: vi.fn(committerFor(() => store.vault)), saveNow: vi.fn(), belegUnsaved: () => false }
})

import ReviewView from './ReviewView.svelte'

beforeEach(() => {
  const raw = createEmptyVault('Main')
  budget.seedDefaults(raw, 'en', '2026-01')
  for (const e of raw.budget.entries) delete e.automatic
  const v = $state(raw)
  store.vault = v
})

afterEach(cleanup)

const rent = () => store.vault!.budget.entries.find(e => e.name === 'Rent')!

/**
 * How somebody finds out a line can be marked as paid automatically: Review
 * asks, beside Rent at "0 / 1'350", this month.
 */
describe('asking whether a line is paid automatically', () => {
  test('a planned line with nothing spent this month offers it, and one tap marks it', async () => {
    render(ReviewView, { vault: store.vault! })
    const line = screen.getByText('Rent').closest('li')!

    await userEvent.click(within(line).getByRole('button', { name: 'Paid automatically?' }))

    expect(rent().automatic).toBe(true)
    expect(within(screen.getByText('Rent').closest('li')!).getByText('automatic')).toBeTruthy()
    expect(within(screen.getByText('Rent').closest('li')!).queryByRole('button', { name: 'Paid automatically?' })).toBeNull()
  })

  test('a reader is not asked', () => {
    render(ReviewView, { vault: store.vault!, readOnly: true })
    expect(screen.queryByRole('button', { name: 'Paid automatically?' })).toBeNull()
  })
})
