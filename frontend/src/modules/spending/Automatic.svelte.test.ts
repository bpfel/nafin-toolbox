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
import { getNotices, clearNotices } from '../../lib/sync/notices.svelte'

beforeEach(() => {
  const raw = createEmptyVault('Main')
  budget.seedDefaults(raw, 'en', '2026-01')
  for (const e of raw.budget.entries) delete e.automatic
  const v = $state(raw)
  store.vault = v
})

afterEach(() => {
  cleanup()
  clearNotices()
})

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

  // One tap is easy to make by mistake, so it is said, with Undo.
  test('marking says so, with Undo', async () => {
    render(ReviewView, { vault: store.vault! })
    await userEvent.click(within(screen.getByText('Rent').closest('li')!).getByRole('button', { name: 'Paid automatically?' }))

    const notice = getNotices().find(n => n.kind === 'automatic')
    expect(notice).toMatchObject({ subject: 'Rent', undo: { kind: 'setEntryAutomatic', args: [rent().id, false] } })
  })

  // And the way back, found where the mark is: the line opens, as any line does.
  test('an automatic line opens to go back to receipts', async () => {
    rent().automatic = true
    render(ReviewView, { vault: store.vault! })

    await userEvent.click(screen.getByText('Rent'))
    await userEvent.click(screen.getByRole('button', { name: 'Record receipts instead' }))

    expect(rent().automatic).toBeUndefined()
  })

  test('a reader is not asked', () => {
    render(ReviewView, { vault: store.vault!, readOnly: true })
    expect(screen.queryByRole('button', { name: 'Paid automatically?' })).toBeNull()
  })
})
