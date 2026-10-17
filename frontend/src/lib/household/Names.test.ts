import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/svelte'
import userEvent from '@testing-library/user-event'

const store = vi.hoisted(() => ({ people: {} as Record<string, { name: string }> }))

vi.mock('../crypto/vaultStore.svelte', () => ({
  getVaultState: () => ({ households: [] }),
  inviteToHousehold: vi.fn(),
  loadInvites: vi.fn(async () => []),
  confirmMember: vi.fn(),
  withdrawInvite: vi.fn(),
  listMembers: vi.fn(async () => [
    { user_id: 1, email: 'me@example.ch', role: 'owner', joined_at: '2026-01-01' },
    { user_id: 8, email: 'anna@example.ch', role: 'writer', joined_at: '2026-02-01' },
  ]),
  removeMember: vi.fn(),
  changeRole: vi.fn(),
  peopleOf: vi.fn(async () => store.people),
  nameMember: vi.fn(async () => {}),
}))

import { nameMember } from '../crypto/vaultStore.svelte'
import HouseholdPeople from './HouseholdPeople.svelte'

const panel = (isOwner = true) =>
  render(HouseholdPeople, { householdId: 3, isOwner, myUserId: 1, householdName: 'Flat' })

beforeEach(() => {
  cleanup()
  store.people = {}
  vi.mocked(nameMember).mockClear()
})

/**
 * What a household calls its members. Only the owner names people, themselves
 * included; until somebody is named, the address shows, as it always did.
 */
describe('names in a household', () => {
  test('a named member shows the name, with the address under it', async () => {
    store.people = { '8': { name: 'Anna' } }
    panel()

    await waitFor(() => expect(screen.getByText('Anna')).toBeTruthy())
    expect(screen.getByText('anna@example.ch')).toBeTruthy()
  })

  test('the owner has a pen on everybody, themselves included', async () => {
    panel()

    await waitFor(() => expect(screen.getByText('You')).toBeTruthy())
    expect(screen.getByRole('button', { name: 'Name me@example.ch' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Name anna@example.ch' })).toBeTruthy()
  })

  // Everybody sees what the household calls them; only the owner can change it.
  test('everybody else sees their own row, and no pen anywhere', async () => {
    store.people = { '1': { name: 'Me' } }
    panel(false)

    await waitFor(() => expect(screen.getByText('You')).toBeTruthy())
    expect(screen.getByText('Me')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^Name / })).toBeNull()
  })

  test('naming somebody writes the name to the household', async () => {
    panel()
    await userEvent.click(await screen.findByRole('button', { name: 'Name anna@example.ch' }))

    await userEvent.type(screen.getByLabelText('Name'), 'Anna{Enter}')

    expect(nameMember).toHaveBeenCalledWith(3, 8, 'Anna')
  })

  // The pen used to change the role. It names now; the role is its own control.
  test('the role is still changed from its tag', async () => {
    panel()

    await userEvent.click(await screen.findByRole('button', { name: /Change what anna@example\.ch may do/ }))

    expect(screen.getByLabelText('They may')).toBeTruthy()
  })
})
