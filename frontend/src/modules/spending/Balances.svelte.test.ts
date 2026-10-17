import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/svelte'
import userEvent from '@testing-library/user-event'
import { createEmptyVault, type VaultData } from '../../lib/crypto/vault'
import { addBeleg, JOINT } from '../../lib/belege/belegeEngine'

const store = vi.hoisted(() => ({ vault: null as VaultData | null }))

vi.mock('../../lib/crypto/vaultStore.svelte', async () => {
  const { committerFor } = await import('../../lib/sync/testing')
  return { commit: vi.fn(committerFor(() => store.vault)), saveNow: vi.fn() }
})

import Balances from './Balances.svelte'

const members = [{ id: '1', name: 'Anna' }, { id: '2', name: 'Ben' }]
const shares = { '1': 1, '2': 1 }

beforeEach(() => {
  const raw = createEmptyVault('Main')
  const v = $state(raw)
  addBeleg(v, { date: '2026-10-01', amount: '100', entryId: null, paidBy: '1', shares, createdBy: '1' })
  addBeleg(v, { date: '2026-10-02', amount: '40', entryId: null, paidBy: '2', shares, createdBy: '2' })
  store.vault = v
})

afterEach(cleanup)

const show = (readOnly = false) =>
  render(Balances, { vault: store.vault!, month: '2026-10', members, me: '1', readOnly })

describe('who owes whom', () => {
  test('proposes the one payment that evens two people out, and recording it does', async () => {
    show()

    expect(screen.getByText('Ben pays Anna')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Record payment' }))

    expect(store.vault!.settlements).toHaveLength(1)
    expect(store.vault!.settlements[0]).toMatchObject({ from: '2', to: '1', amount: '30.00' })
    expect(screen.getByText('Everyone is even.')).toBeTruthy()
  })

  test('the joint account changes nobody’s balance', () => {
    addBeleg(store.vault!, { date: '2026-10-03', amount: '500', entryId: null, paidBy: JOINT, shares, createdBy: '1' })
    show()
    expect(screen.getByText('Ben pays Anna')).toBeTruthy()
  })

  test('a reader sees the payment owed, and cannot record it', () => {
    show(true)
    expect(screen.getByText('Ben pays Anna')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Record payment' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Change split' })).toBeNull()
  })

  // One slider for two people: moving one share moves the other.
  test('the split is one slider for two, and always adds up to 100', async () => {
    show()
    await userEvent.click(screen.getByRole('button', { name: 'Change split' }))
    await userEvent.click(screen.getByLabelText('By share'))

    await fireEvent.input(screen.getByRole('slider', { name: 'Anna' }), { target: { value: '70' } })

    expect(screen.getByText('Anna 70%')).toBeTruthy()
    expect(screen.getByText('Ben 30%')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(store.vault!.split).toEqual({ mode: 'shares', shares: { '1': 70, '2': 30 } })
  })

  // Three or more: a slider each, and the others share out the rest in the
  // proportion they had.
  test('with three, moving one shares the rest among the others', async () => {
    const three = [...members, { id: '3', name: 'Cleo' }]
    render(Balances, { vault: store.vault!, month: '2026-10', members: three, me: '1', readOnly: false })
    await userEvent.click(screen.getByRole('button', { name: 'Change split' }))
    await userEvent.click(screen.getByLabelText('By share'))

    await fireEvent.input(screen.getByRole('slider', { name: /Anna/ }), { target: { value: '50' } })
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    const shares = (store.vault!.split as { shares: Record<string, number> }).shares
    expect(shares['1']).toBe(50)
    expect(shares['2'] + shares['3']).toBe(50)
    expect(Math.abs(shares['2'] - shares['3'])).toBeLessThanOrEqual(1)
  })

})
