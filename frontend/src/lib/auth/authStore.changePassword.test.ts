import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'

// The vault is mocked so each test decides what the server's keys look like.
const initializeVault = vi.fn()
const reEncryptMEK = vi.fn()

vi.mock('../crypto/vaultStore.svelte', () => ({
  initializeVault: (...args: unknown[]) => initializeVault(...args),
  reEncryptMEK: (...args: unknown[]) => reEncryptMEK(...args),
  setupKeys: vi.fn(),
  clearVault: vi.fn(),
  recoverVault: vi.fn(),
  tryRestoreVault: vi.fn(),
}))

import { login, changePassword } from './authStore.svelte'

const user = {
  id: 5,
  email: 'new@example.ch',
  role: 'user',
  must_change_password: true,
  email_verified: true,
  totp_enabled: false,
  created_at: '2026-10-04T00:00:00Z',
}

function respond(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

// Tests run in order and share the store's module state on purpose: the second
// checks that the first leaves nothing behind.
describe('changing the password', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    initializeVault.mockReset()
    reEncryptMEK.mockReset()
    fetchMock = vi.fn(async (url: string) =>
      url.endsWith('/auth/login') ? respond(user) : respond({ message: 'password changed' }),
    )
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  test('an account with no vault yet changes its first password', async () => {
    // Created by an admin with a first password, on an instance without
    // email: it must change that password before it has set up a vault.
    initializeVault.mockResolvedValue('no-keys')
    reEncryptMEK.mockRejectedValue(new Error('Vault not unlocked'))
    await login(user.email, 'first-pass-1')

    const result = await changePassword('first-pass-1', 'my-own-pass-1')

    expect(result).toBeNull()
    expect(reEncryptMEK).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/change-password', expect.anything())
  })

  test('an account with an open vault re-encrypts its key first', async () => {
    // Runs after an account that had no vault, in the same module state — as
    // two people signing in on one tab. What the first one's vault said must
    // not decide whether this one's key is re-encrypted.
    initializeVault.mockResolvedValue('ok')
    reEncryptMEK.mockResolvedValue(undefined)
    await login(user.email, 'old-pass-123')

    const result = await changePassword('old-pass-123', 'new-pass-456')

    expect(result).toBeNull()
    expect(reEncryptMEK).toHaveBeenCalledWith('old-pass-123', 'new-pass-456', user.email)
  })

  test('if the key cannot be re-encrypted, the password is not changed', async () => {
    // Changing it anyway would leave the vault wrapped under a password the
    // account no longer has.
    initializeVault.mockResolvedValue('ok')
    reEncryptMEK.mockRejectedValue(new Error('Vault not unlocked'))
    await login(user.email, 'old-pass-123')

    const result = await changePassword('old-pass-123', 'new-pass-456')

    expect(result).toBe('Vault not unlocked')
    expect(fetchMock).not.toHaveBeenCalledWith('/api/auth/change-password', expect.anything())
  })

  test('a new password the server would refuse stops before the vault is touched', async () => {
    // The key is re-wrapped first. Re-wrapped under a password the server then
    // refused, the vault would open with no password the account has.
    initializeVault.mockResolvedValue('ok')
    reEncryptMEK.mockResolvedValue(undefined)
    await login(user.email, 'old-pass-123')

    const result = await changePassword('old-pass-123', 'short')

    expect(result).toBe('password must be at least 8 characters (AUTH-051)')
    expect(reEncryptMEK).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalledWith('/api/auth/change-password', expect.anything())
  })

  test('an empty field is named, with its code, before the vault is touched', async () => {
    initializeVault.mockResolvedValue('ok')
    await login(user.email, 'old-pass-123')

    const result = await changePassword('', 'new-pass-456')

    expect(result).toBe('current and new password required (AUTH-018)')
    expect(reEncryptMEK).not.toHaveBeenCalled()
  })
})
