import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/svelte'
import { vi, describe, test, expect, afterEach } from 'vitest'

const state = {
  lockouts: [
    { kind: 'address', key: 'anna@example.ch', attempts: 30, until: '2026-10-24T10:00:00Z' },
    { kind: 'two_factor', key: '7', attempts: 10, until: '2026-10-24T09:30:00Z', email: 'ben@example.ch' },
  ],
}
const clearLockouts = vi.fn(async (request: { kind?: string; key?: string; all?: boolean }) => {
  state.lockouts = request.all ? [] : state.lockouts.filter((l) => !(l.kind === request.kind && l.key === request.key))
  return null
})
vi.mock('./authStore.svelte', () => ({
  listLockouts: vi.fn(async () => ({ lockouts: [...state.lockouts] })),
  clearLockouts: (r: { kind?: string; key?: string; all?: boolean }) => clearLockouts(r),
}))

import LockoutsPanel from './LockoutsPanel.svelte'

afterEach(cleanup)

describe('Sign-in lockouts', () => {
  test('lists who is locked out, by address rather than by user id', async () => {
    render(LockoutsPanel)
    expect(await screen.findByText('anna@example.ch')).toBeTruthy()
    expect(screen.getByText('ben@example.ch')).toBeTruthy()
    expect(screen.queryByText('7')).toBeNull()
  })

  test('clears one, and the list is read again', async () => {
    render(LockoutsPanel)
    await screen.findByText('anna@example.ch')
    await fireEvent.click(screen.getAllByRole('button', { name: 'Clear' })[0])
    expect(clearLockouts).toHaveBeenCalledWith({ kind: 'address', key: 'anna@example.ch' })
    await waitFor(() => expect(screen.queryByText('anna@example.ch')).toBeNull())
    expect(screen.getByText('ben@example.ch')).toBeTruthy()
  })

  test('says so when nobody is locked out', async () => {
    state.lockouts = []
    render(LockoutsPanel)
    expect(await screen.findByText('Nobody is locked out.')).toBeTruthy()
  })
})
