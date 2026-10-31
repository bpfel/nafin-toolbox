import { render, screen, cleanup } from '@testing-library/svelte'
import { vi, describe, test, expect, afterEach } from 'vitest'

const settings = { require_2fa: false }
const who = { role: 'user' }
vi.mock('../crypto/vaultStore.svelte', () => ({ deleteAllMyData: vi.fn() }))
vi.mock('./authStore.svelte', () => ({
  getAuthState: () => ({ currentUser: { id: 1, email: 'anna@nafin.test', totp_enabled: true, role: who.role } }),
  disable2FA: vi.fn(),
  regenerateRecoveryCodes: vi.fn(),
  deleteAccount: vi.fn(),
  getSettings: vi.fn(async () => settings),
}))

import SecuritySettings from './SecuritySettings.svelte'

afterEach(cleanup)

/**
 * The server refuses to turn 2FA off while the instance requires it, so the
 * profile does not offer to: a button whose only answer is an error code is a
 * question the app already knows the answer to.
 */
describe('Disable 2FA', () => {
  test('is offered when the instance does not require 2FA', async () => {
    settings.require_2fa = false
    who.role = 'user'
    render(SecuritySettings)
    expect(await screen.findByRole('button', { name: 'Disable 2FA' })).toBeTruthy()
    expect(screen.queryByText('Required here, so it cannot be turned off.')).toBeNull()
  })

  test('is not offered, and says why, when the instance requires 2FA', async () => {
    settings.require_2fa = true
    who.role = 'user'
    render(SecuritySettings)
    expect(await screen.findByText('Required here, so it cannot be turned off.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Disable 2FA' })).toBeNull()
    // New recovery codes are still to be had.
    expect(screen.getByRole('button', { name: 'Regenerate Recovery Codes' })).toBeTruthy()
  })

  test('is never offered to an administrator', async () => {
    settings.require_2fa = false
    who.role = 'admin'
    render(SecuritySettings)
    expect(await screen.findByText('Required here, so it cannot be turned off.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Disable 2FA' })).toBeNull()
  })
})
