import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'

// The vault is mocked: what is tested is when it is opened.
const initializeVault = vi.fn(async () => 'ok')

vi.mock('../crypto/vaultStore.svelte', () => ({
  initializeVault: (...args: unknown[]) => initializeVault(...(args as [])),
  wrapMEKFor: vi.fn(),
  prepareSetup: vi.fn(),
  clearVault: vi.fn(),
  recoverVault: vi.fn(),
  tryRestoreVault: vi.fn(),
  prepareUpgrade: vi.fn(),
  recoveryNeedsRenewal: () => false,
  upgradeStored: vi.fn(),
  saveVault: vi.fn(),
  getVaultState: () => ({ dirty: false }),
  opensVault: vi.fn(async () => true),
  prepareRenewal: vi.fn(),
  renewalStored: vi.fn(),
}))

import { login, logout, confirm2FA } from './authStore.svelte'

const user = {
  id: 5, email: 'anna@example.ch', role: 'user', must_change_password: false,
  email_verified: true, totp_enabled: false, created_at: '2026-10-04T00:00:00Z', auth_version: 2,
}

function respond(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

// With the instance requiring 2FA, the server refuses the vault to an account
// without one (RequireEnrolment). Opening it at sign-in failed; it is opened
// once the second factor is confirmed instead, with the keys held till then.
describe('a sign-in that must enrol a second factor first', () => {
  let required = true

  beforeEach(async () => {
    initializeVault.mockClear()
    vi.stubGlobal('fetch', vi.fn(async (url: string) =>
      url.endsWith('/auth/prelogin') ? respond({ auth_version: 2, kdf: 'pbkdf2-sha256', iterations: 1000 })
        : url.endsWith('/auth/login') ? respond(user)
        : url.endsWith('/auth/settings') ? respond({ require_2fa: required, twofa_available: true })
        : url.endsWith('/auth/2fa/confirm') ? respond({ recovery_codes: ['aaaa-bbbb'] })
        : respond({}),
    ))
  })

  afterEach(async () => {
    await logout()
    vi.unstubAllGlobals()
  })

  test('opens the vault only once the factor is confirmed', async () => {
    required = true
    await login(user.email, 'anna-pass-1')
    expect(initializeVault).not.toHaveBeenCalled()

    await confirm2FA('123456')

    expect(initializeVault).toHaveBeenCalledTimes(1)
  })

  test('opens it at sign-in as before when 2FA is not required', async () => {
    required = false
    await login(user.email, 'anna-pass-1')
    expect(initializeVault).toHaveBeenCalledTimes(1)
  })
})
