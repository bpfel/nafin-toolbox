import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'

// The vault is mocked so each test decides what the server's keys look like.
const initializeVault = vi.fn()
const wrapMEKFor = vi.fn()

vi.mock('../crypto/vaultStore.svelte', () => ({
  initializeVault: (...args: unknown[]) => initializeVault(...args),
  wrapMEKFor: (...args: unknown[]) => wrapMEKFor(...args),
  prepareSetup: vi.fn(),
  clearVault: vi.fn(),
  recoverVault: vi.fn(),
  tryRestoreVault: vi.fn(),
  prepareUpgrade: vi.fn(),
  recoveryNeedsRenewal: () => false,
  upgradeStored: vi.fn(),
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
  auth_version: 2,
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
    wrapMEKFor.mockReset()
    fetchMock = vi.fn(async (url: string) =>
      url.endsWith('/auth/prelogin') ? respond({ auth_version: 2, kdf: 'pbkdf2-sha256', iterations: 1000 })
        : url.endsWith('/auth/login') ? respond(user)
        : respond({ message: 'password changed' }),
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
    wrapMEKFor.mockRejectedValue(new Error('Vault not unlocked'))
    await login(user.email, 'first-pass-1')

    const result = await changePassword('first-pass-1', 'my-own-pass-1')

    expect(result).toBeNull()
    expect(wrapMEKFor).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/change-password', expect.anything())
  })

  test('an account with an open vault re-wraps its key for the change', async () => {
    // Runs after an account that had no vault, in the same module state — as
    // two people signing in on one tab. What the first one's vault said must
    // not decide whether this one's key is re-encrypted.
    initializeVault.mockResolvedValue('ok')
    wrapMEKFor.mockResolvedValue('WRAPPED-UNDER-NEW')
    await login(user.email, 'old-pass-123')

    const result = await changePassword('old-pass-123', 'new-pass-456')

    expect(result).toBeNull()
    expect(wrapMEKFor).toHaveBeenCalledWith(expect.objectContaining({ authKey: expect.any(String) }))
  })

  test('neither password is sent, only keys derived from them', async () => {
    initializeVault.mockResolvedValue('ok')
    wrapMEKFor.mockResolvedValue('WRAPPED-UNDER-NEW')
    await login(user.email, 'old-pass-123')
    await changePassword('old-pass-123', 'new-pass-456')

    const sent = fetchMock.mock.calls.map(([, init]) => String((init as RequestInit | undefined)?.body ?? ''))
    for (const body of sent) {
      expect(body).not.toContain('old-pass-123')
      expect(body).not.toContain('new-pass-456')
    }
    const change = JSON.parse(sent[fetchMock.mock.calls.findIndex(([url]) => String(url).endsWith('/auth/change-password'))])
    expect(Object.keys(change).sort()).toEqual(['current_auth_key', 'encrypted_mek', 'new_auth_key'])
  })

  test('the re-wrapped key travels with the change, never ahead of it', async () => {
    // Stored on its own first, a change the server then refused — a mistyped
    // current password — left the vault opening with no password the account
    // had. Now the server stores both together, after the proof.
    initializeVault.mockResolvedValue('ok')
    wrapMEKFor.mockResolvedValue('WRAPPED-UNDER-NEW')
    fetchMock.mockImplementation(async (url: string) =>
      url.endsWith('/auth/prelogin') ? respond({ auth_version: 2, kdf: 'pbkdf2-sha256', iterations: 1000 })
        : url.endsWith('/auth/login') ? respond(user)
        : url.endsWith('/auth/change-password') ? respond({ error: 'current password is incorrect', code: 'AUTH-015' }, 401)
        : respond({}),
    )
    await login(user.email, 'old-pass-123')

    const result = await changePassword('mistyped-pass', 'new-pass-456')

    expect(result).toBe('current password is incorrect (AUTH-015)')
    const calls = fetchMock.mock.calls.map(([url, init]) => [String(url), (init as RequestInit | undefined)?.method ?? 'GET'])
    expect(calls).not.toContainEqual(['/api/vault/keys', 'PUT'])
    const change = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/auth/change-password'))!
    expect(JSON.parse(String((change[1] as RequestInit).body)).encrypted_mek).toBe('WRAPPED-UNDER-NEW')
  })

  test('if the key cannot be re-encrypted, the password is not changed', async () => {
    // Changing it anyway would leave the vault wrapped under a password the
    // account no longer has.
    initializeVault.mockResolvedValue('ok')
    wrapMEKFor.mockRejectedValue(new Error('Vault not unlocked'))
    await login(user.email, 'old-pass-123')

    const result = await changePassword('old-pass-123', 'new-pass-456')

    expect(result).toBe('Vault not unlocked')
    expect(fetchMock).not.toHaveBeenCalledWith('/api/auth/change-password', expect.anything())
  })

  test('a new password the server would refuse stops before the vault is touched', async () => {
    // The key is re-wrapped first. Re-wrapped under a password the server then
    // refused, the vault would open with no password the account has.
    initializeVault.mockResolvedValue('ok')
    wrapMEKFor.mockResolvedValue('WRAPPED-UNDER-NEW')
    await login(user.email, 'old-pass-123')

    const result = await changePassword('old-pass-123', 'short')

    expect(result).toBe('password must be at least 8 characters (AUTH-051)')
    expect(wrapMEKFor).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalledWith('/api/auth/change-password', expect.anything())
  })

  test('an empty field is named, with its code, before the vault is touched', async () => {
    initializeVault.mockResolvedValue('ok')
    await login(user.email, 'old-pass-123')

    const result = await changePassword('', 'new-pass-456')

    expect(result).toBe('current and new password required (AUTH-018)')
    expect(wrapMEKFor).not.toHaveBeenCalled()
  })
})
