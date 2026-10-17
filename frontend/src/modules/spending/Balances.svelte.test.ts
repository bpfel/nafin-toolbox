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

  // Two people: typing one share sets the other.
  test('typing one share of two sets the other, so it always adds up to 100', async () => {
    show()
    await userEvent.click(screen.getByRole('button', { name: 'Change split' }))
    await userEvent.click(screen.getByLabelText('By share'))

    await fireEvent.input(screen.getByLabelText('Anna'), { target: { value: '70' } })

    expect((screen.getByLabelText('Ben') as HTMLInputElement).value).toBe('30')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(store.vault!.split).toEqual({ mode: 'shares', shares: { '1': 70, '2': 30 } })
  })

  // Three: whoever has not been typed in gives way, so what you typed stays.
  test('with three, the one not typed in takes the rest', async () => {
    const three = [...members, { id: '3', name: 'Cleo' }]
    render(Balances, { vault: store.vault!, month: '2026-10', members: three, me: '1', readOnly: false })
    await userEvent.click(screen.getByRole('button', { name: 'Change split' }))
    await userEvent.click(screen.getByLabelText('By share'))

    await fireEvent.input(screen.getByLabelText('Anna'), { target: { value: '50' } })
    await fireEvent.input(screen.getByLabelText('Ben'), { target: { value: '30' } })

    expect((screen.getByLabelText('Anna') as HTMLInputElement).value).toBe('50')
    expect((screen.getByLabelText('Cleo') as HTMLInputElement).value).toBe('20')

    // Cleo typed in too: now Anna, typed longest ago, gives way.
    await fireEvent.input(screen.getByLabelText('Cleo'), { target: { value: '40' } })
    expect((screen.getByLabelText('Ben') as HTMLInputElement).value).toBe('30')
    expect((screen.getByLabelText('Anna') as HTMLInputElement).value).toBe('30')
  })
})
