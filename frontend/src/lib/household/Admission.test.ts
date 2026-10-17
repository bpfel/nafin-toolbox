import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/svelte'

const store = vi.hoisted(() => ({
  invites: [] as Record<string, unknown>[],
  households: [{ id: 3, name: 'Flat', role: 'owner' }] as { id: number; name: string; role: string }[],
}))

vi.mock('../crypto/vaultStore.svelte', () => ({
  getVaultState: () => ({ households: store.households }),
  inviteToHousehold: vi.fn(),
  loadInvites: vi.fn(async () => store.invites),
  confirmMember: vi.fn(async () => {}),
  withdrawInvite: vi.fn(),
  listMembers: vi.fn(async () => []),
  removeMember: vi.fn(),
  changeRole: vi.fn(),
}))

import { confirmMember, loadInvites } from '../crypto/vaultStore.svelte'
import HouseholdPeople from './HouseholdPeople.svelte'
import { getInvitationState, recordInvites, startInvitationWatch } from './invitations.svelte'

const pending = { id: 7, invited_email: 'ben@example.ch', role: 'writer', verified: false, link: 'https://x/join#t=a&s=b' }
const accepted = { ...pending, accepted_at: '2026-10-17T10:00:00Z', verified: true }
const mismatched = { ...accepted, verified: false }

/** Lets pending promises run. setTimeout is left real; only the intervals are faked. */
const settle = () => new Promise(r => setTimeout(r, 20))

const panel = () =>
  render(HouseholdPeople, { householdId: 3, isOwner: true, myUserId: 1, householdName: 'Flat' })

beforeEach(() => {
  cleanup()
  store.invites = []
  vi.mocked(confirmMember).mockClear()
  vi.mocked(loadInvites).mockClear()
  recordInvites(3, [])
})

afterEach(() => {
  vi.useRealTimers()
})

/**
 * Letting somebody into a household is a button now. It used to happen by
 * itself when the owner's app next loaded — so the invitee waited, and nothing
 * on the owner's screen said why.
 */
describe('confirming who may come in', () => {
  test('an acceptance that checks out offers Confirm, and nothing happens until it is pressed', async () => {
    store.invites = [accepted]
    panel()

    const button = await screen.findByRole('button', { name: 'Confirm' })
    expect(confirmMember).not.toHaveBeenCalled()

    await fireEvent.click(button)

    expect(confirmMember).toHaveBeenCalledWith(3, accepted)
  })

  test('a key that does not match its invitation offers no Confirm, only the warning', async () => {
    store.invites = [mismatched]
    panel()

    await waitFor(() => expect(screen.getByText(/does not match/i)).toBeTruthy())
    expect(screen.queryByRole('button', { name: 'Confirm' })).toBeNull()
  })

  test('nor does an invitation nobody has accepted yet', async () => {
    store.invites = [pending]
    panel()

    await waitFor(() => expect(screen.getByText('Invited')).toBeTruthy())
    expect(screen.queryByRole('button', { name: 'Confirm' })).toBeNull()
  })

  test('only the owner is offered it', async () => {
    store.invites = [accepted]
    render(HouseholdPeople, { householdId: 3, isOwner: false, myUserId: 1, householdName: 'Flat' })

    await waitFor(() => expect(loadInvites).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: 'Confirm' })).toBeNull()
  })
})

describe('the panel watches while an invitation is open', () => {
  test('Confirm appears by itself once the invitation is accepted', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    store.invites = [pending]
    panel()
    await waitFor(() => expect(screen.getByText('Invited')).toBeTruthy())

    store.invites = [accepted]
    await vi.advanceTimersByTimeAsync(4000)

    await waitFor(() => expect(screen.getByRole('button', { name: 'Confirm' })).toBeTruthy())
  })

  test('and asks nothing while there is no invitation', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    panel()
    await settle()
    expect(loadInvites).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(60_000)

    expect(loadInvites).toHaveBeenCalledTimes(1)
  })
})

/** The dot: so an owner on another screen learns somebody is waiting. */
describe('somebody waiting, wherever the owner is', () => {
  const invitations = getInvitationState()

  test('an accepted invitation is waiting; a pending one is not', () => {
    recordInvites(3, [pending as never])
    expect(invitations.anyWaiting).toBe(false)

    recordInvites(3, [accepted as never])
    expect(invitations.anyWaiting).toBe(true)
    expect(invitations.waitingIn(3)).toBe(1)

    recordInvites(3, [])
    expect(invitations.anyWaiting).toBe(false)
  })

  test('the watch asks once about each owned household, then only where something is open', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    store.households = [
      { id: 3, name: 'Flat', role: 'owner' },
      { id: 4, name: 'Cabin', role: 'writer' },
      { id: 5, name: 'Club', role: 'owner' },
    ]
    vi.mocked(loadInvites).mockImplementation(async id => (id === 3 ? [accepted] : []) as never)

    const stop = startInvitationWatch()
    await settle()
    expect(invitations.anyWaiting).toBe(true)
    expect(vi.mocked(loadInvites).mock.calls.map(c => c[0]).sort()).toEqual([3, 5])

    vi.mocked(loadInvites).mockClear()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(vi.mocked(loadInvites).mock.calls.map(c => c[0])).toEqual([3])

    stop()
    expect(invitations.anyWaiting).toBe(false)
    vi.mocked(loadInvites).mockImplementation(async () => store.invites as never)
  })
})
