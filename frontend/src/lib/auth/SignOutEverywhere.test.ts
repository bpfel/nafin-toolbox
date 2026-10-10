import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/svelte'
import { vi, describe, test, expect, afterEach } from 'vitest'

const auth = vi.hoisted(() => ({ role: 'user', result: true }))

vi.mock('./authStore.svelte', () => ({
  getAuthState: () => ({
    get currentUser() {
      return { id: 2, email: 'anna@example.ch', role: auth.role, totp_enabled: false }
    },
  }),
  disable2FA: vi.fn(),
  regenerateRecoveryCodes: vi.fn(),
  deleteAccount: vi.fn(),
  logoutEverywhere: vi.fn(async () => auth.result),
}))

import { logoutEverywhere } from './authStore.svelte'
import SecuritySettings from './SecuritySettings.svelte'

/**
 * Signing in no longer signs a user's other devices out, so there has to be a
 * way to end them all — for a lost phone, or a computer left signed in.
 */
describe('signing out everywhere', () => {
  // No global setup file registers auto-cleanup, so the DOM is cleared by hand.
  afterEach(() => {
    cleanup()
    auth.role = 'user'
    auth.result = true
    vi.mocked(logoutEverywhere).mockClear()
  })

  test('is offered to a user, and ends every session', async () => {
    render(SecuritySettings)

    await fireEvent.click(screen.getByRole('button', { name: 'Sign out everywhere' }))

    expect(logoutEverywhere).toHaveBeenCalledTimes(1)
  })

  test('says so when it did not work, and can be tried again', async () => {
    auth.result = false
    render(SecuritySettings)
    const button = screen.getByRole('button', { name: 'Sign out everywhere' }) as HTMLButtonElement

    await fireEvent.click(button)

    await waitFor(() => expect(screen.getByText(/could not sign out everywhere/i)).toBeTruthy())
    expect(button.disabled).toBe(false)
  })

  // An administrator has one session at a time; "everywhere" would only mean here.
  test('is not offered to an administrator', () => {
    auth.role = 'admin'
    render(SecuritySettings)

    expect(screen.queryByRole('button', { name: 'Sign out everywhere' })).toBeNull()
  })
})
