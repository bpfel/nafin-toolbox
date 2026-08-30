import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/svelte'
import { vi, describe, test, expect, beforeEach, afterEach } from 'vitest'

const target = {
  id: 7,
  email: 'anna@example.ch',
  role: 'user' as const,
  must_change_password: false,
  email_verified: true,
  totp_enabled: false,
  created_at: '2026-01-01T00:00:00Z',
}

const deleteUser = vi.fn().mockResolvedValue(null)

vi.mock('./authStore.svelte', () => ({
  inviteUser: vi.fn(),
  listUsers: vi.fn(async () => [target]),
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
