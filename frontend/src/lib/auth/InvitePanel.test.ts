import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/svelte'
import { vi, describe, test, expect, beforeEach, afterEach } from 'vitest'
// Type-only, so it is erased and does not reach the mocked module below.
import type { User } from './authStore.svelte'

const target = {
  id: 7,
  email: 'anna@example.ch',
  role: 'user' as const,
  must_change_password: false,
  email_verified: true,
  totp_enabled: false,
  created_at: '2026-01-01T00:00:00Z',
}

function member(id: number, role: User['role']): User {
  return { ...target, id, email: `user${id}@example.ch`, role }
}

// Read at call time by the mock below, so a test can set the roster it wants.
let roster: User[] = [target]

const deleteUser = vi.fn().mockResolvedValue(null)

vi.mock('./authStore.svelte', () => ({
  inviteUser: vi.fn(),
  listUsers: vi.fn(async () => roster),
  deleteUser: (id: number) => deleteUser(id),
  resendVerification: vi.fn(),
  adminResetPassword: vi.fn(),
  getAuthState: () => ({ currentUser: { id: 1, email: 'admin@example.ch', role: 'admin' } }),
}))

import InvitePanel from './InvitePanel.svelte'

describe('InvitePanel deletion safeguard', () => {
  // No global setup file registers auto-cleanup, so the DOM is cleared by hand.
  afterEach(cleanup)

  beforeEach(() => {
    deleteUser.mockClear()
    roster = [target]
  })

  test('the Delete button opens the safeguard instead of deleting', async () => {
    render(InvitePanel, { props: {} })

    const row = await screen.findByRole('button', { name: 'Delete' })
    await fireEvent.click(row)

    expect(deleteUser).not.toHaveBeenCalled()
    expect(await screen.findByRole('dialog', { name: 'Delete user' })).toBeTruthy()
  })

  test('deletes once both steps are cleared', async () => {
    render(InvitePanel, { props: {} })

    await fireEvent.click(await screen.findByRole('button', { name: 'Delete' }))
    await fireEvent.input(screen.getByLabelText(/type their email address/i), {
      target: { value: target.email },
    })
    await fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    await fireEvent.click(await screen.findByRole('button', { name: /delete permanently/i }))

    await waitFor(() => expect(deleteUser).toHaveBeenCalledWith(target.id))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
})

describe('InvitePanel will not offer to delete the last admin', () => {
  afterEach(cleanup)

  // The server refuses this regardless — see DeleteUserGuardingLastAdmin. An
  // app with no admin has no invitations, no user administration and no way to
  // promote anybody, because a role is fixed when the account is made.
  test('the only admin has a disabled Delete, and says why', async () => {
    roster = [member(2, 'admin'), member(7, 'user')]
    render(InvitePanel, { props: {} })

    const buttons = await screen.findAllByRole('button', { name: 'Delete' })
    expect(buttons).toHaveLength(2)

    expect((buttons[0] as HTMLButtonElement).disabled).toBe(true)
    expect(buttons[0].getAttribute('title')).toBe('The last administrator cannot be deleted')

    // The ordinary user beside them is unaffected: it is the admin roster that
    // must not empty, not the users table.
    expect((buttons[1] as HTMLButtonElement).disabled).toBe(false)
  })

  test('with two admins, either may go', async () => {
    roster = [member(2, 'admin'), member(3, 'admin')]
    render(InvitePanel, { props: {} })

    const buttons = await screen.findAllByRole('button', { name: 'Delete' })
    expect(buttons.map(b => (b as HTMLButtonElement).disabled)).toEqual([false, false])
  })
})
