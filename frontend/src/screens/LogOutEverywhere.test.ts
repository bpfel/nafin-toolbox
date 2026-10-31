import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/svelte'
import { vi, describe, test, expect, afterEach } from 'vitest'

const auth = vi.hoisted(() => ({ result: true }))

vi.mock('../lib/auth/authStore.svelte', () => ({
  getAuthState: () => ({
    get currentUser() {
      return { id: 2, email: 'anna@example.ch', role: 'user', totp_enabled: false }
    },
  }),
  disable2FA: vi.fn(),
  regenerateRecoveryCodes: vi.fn(),
  deleteAccount: vi.fn(),
  getSettings: vi.fn(async () => ({ require_2fa: false })),
  logoutEverywhere: vi.fn(async () => auth.result),
}))

// The households box is on the same page and reads the vault; an empty one is
// all this test needs of it.
vi.mock('../lib/crypto/vaultStore.svelte', () => ({
  getVaultState: () => ({ vaults: [], households: [], activeVaultId: null, data: null }),
  createHousehold: vi.fn(),
  renameHousehold: vi.fn(),
  deleteHousehold: vi.fn(),
}))

import { logoutEverywhere } from '../lib/auth/authStore.svelte'
import ProfileScreen from './ProfileScreen.svelte'

/**
 * Signing in no longer signs a user's other devices out, so there has to be a
 * way to end them all — for a lost phone, or a computer left signed in. It sits
 * beside "Log out", where a person looks for it.
 */
describe('logging out everywhere', () => {
  // No global setup file registers auto-cleanup, so the DOM is cleared by hand.
  afterEach(() => {
    cleanup()
    auth.result = true
    vi.mocked(logoutEverywhere).mockClear()
  })

  const profile = (role = 'user') =>
    render(ProfileScreen, { email: 'anna@example.ch', role, userId: 2, onlogout: vi.fn() })

  test('is offered to a user beside Log out, and ends every session', async () => {
    profile()
    const button = screen.getByRole('button', { name: 'Log out everywhere' })

    expect(button.parentElement).toBe(screen.getByRole('button', { name: 'Log out' }).parentElement)

    await fireEvent.click(button)

    expect(logoutEverywhere).toHaveBeenCalledTimes(1)
  })

  test('says so when it did not work, and can be tried again', async () => {
    auth.result = false
    profile()
    const button = screen.getByRole('button', { name: 'Log out everywhere' }) as HTMLButtonElement

    await fireEvent.click(button)

    await waitFor(() => expect(screen.getByText(/could not log out everywhere/i)).toBeTruthy())
    expect(button.disabled).toBe(false)
  })

  // An administrator has one session at a time; "everywhere" would only mean here.
  test('is not offered to an administrator', () => {
    profile('admin')

    expect(screen.getByRole('button', { name: 'Log out' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Log out everywhere' })).toBeNull()
  })
})
