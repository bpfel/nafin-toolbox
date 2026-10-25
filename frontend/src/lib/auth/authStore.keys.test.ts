import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'

// The vault is mocked: what is tested here is what leaves the browser, and when.
const initializeVault = vi.fn()
const prepareUpgrade = vi.fn()
const state = { recoveryNeedsRenewal: false }

vi.mock('../crypto/vaultStore.svelte', () => ({
  initializeVault: (...args: unknown[]) => initializeVault(...args),
  prepareUpgrade: (...args: unknown[]) => prepareUpgrade(...args),
  recoveryNeedsRenewal: () => state.recoveryNeedsRenewal,
  upgradeStored: vi.fn(),
  reEncryptMEK: vi.fn(),
  setupKeys: vi.fn(async () => 'NEW-RECOVERY-KEY'),
  clearVault: vi.fn(),
  recoverVault: vi.fn(),
  tryRestoreVault: vi.fn(),
  saveVault: vi.fn(),
  getVaultState: () => ({ dirty: false }),
  opensVault: vi.fn(async () => true),
  prepareRenewal: vi.fn(async () => ({ recoveryKey: 'RENEWED-RECOVERY-KEY', body: { new_auth_key: 'NEW-AUTH-KEY-PLACEHOLDER', encrypted_mek: 'NEW-MEK' }, newMEK: {} })),
  renewalStored: vi.fn(),
}))

import { login, logout, confirmKeyChange, getAuthState, verifyEmail, inviteUser, disable2FA } from './authStore.svelte'

const PASSWORD = 'correct horse battery staple'

function respond(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function account(version: number, role = 'user') {
  return { id: 7, email: 'anna@example.ch', role, must_change_password: false, email_verified: true, totp_enabled: false, created_at: '2026-10-24T00:00:00Z', auth_version: version }
}

let fetchMock: ReturnType<typeof vi.fn>
let server: { version: number; role: string; upgradeFails?: boolean }

function sent(path: string): Record<string, string>[] {
  return fetchMock.mock.calls
    .filter(([url]) => String(url).endsWith(path))
    .map(([, init]) => JSON.parse(String((init as RequestInit).body)))
}

function everyBody(): string {
  return fetchMock.mock.calls.map(([, init]) => String((init as RequestInit | undefined)?.body ?? '')).join('\n')
}

beforeEach(async () => {
  initializeVault.mockReset().mockResolvedValue('ok')
  prepareUpgrade.mockReset().mockResolvedValue({ recoveryKey: null, encrypted_mek: 'MEK-UNDER-VAULT-KEK' })
  state.recoveryNeedsRenewal = false
  server = { version: 2, role: 'user' }
  fetchMock = vi.fn(async (url: string) => {
    if (url.endsWith('/auth/prelogin')) return respond({ auth_version: server.version, kdf: 'pbkdf2-sha256', iterations: 1000 })
    if (url.endsWith('/auth/login')) return respond(account(server.version, server.role))
    if (url.endsWith('/auth/upgrade')) return server.upgradeFails ? respond({ error: 'internal error' }, 500) : respond(account(2, server.role))
    if (url.endsWith('/auth/renew-keys')) return respond({ status: 'ok', vault_updated_at: '2026-10-25T00:00:00Z' })
    if (url.endsWith('/auth/invitation')) return respond({ email: 'ben@example.ch', iterations: 1000 })
    if (url.endsWith('/auth/verify-email')) return respond(account(2))
    return respond({ status: 'ok' })
  })
  vi.stubGlobal('fetch', fetchMock)
  await logout() // a clean store, whatever the test before left
  fetchMock.mockClear()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('signing in', () => {
  test('a version 2 account sends an auth key, never the password', async () => {
    await login('anna@example.ch', PASSWORD)

    const [body] = sent('/auth/login')
    expect(Object.keys(body).sort()).toEqual(['auth_key', 'email'])
    expect(body.auth_key).toMatch(/^[A-Za-z0-9+/]{43}=$/)
    expect(everyBody()).not.toContain(PASSWORD)
    expect(sent('/auth/upgrade')).toHaveLength(0)
  })

  test('a version 1 account sends its password once more, then moves', async () => {
    server.version = 1
    await login('anna@example.ch', PASSWORD)

    expect(sent('/auth/login')[0].password).toBe(PASSWORD)
    const [upgrade] = sent('/auth/upgrade')
    expect(upgrade.password).toBe(PASSWORD) // the proof the server needs
    expect(upgrade.new_auth_key).toMatch(/^[A-Za-z0-9+/]{43}=$/)
    expect(upgrade.encrypted_mek).toBe('MEK-UNDER-VAULT-KEK')
    expect(prepareUpgrade).toHaveBeenCalledWith(expect.anything(), true, false)
  })

  test('with a recovery key the server once received, nothing is sent until the new one is written down', async () => {
    server.version = 1
    state.recoveryNeedsRenewal = true
    prepareUpgrade.mockResolvedValue({ recoveryKey: 'NEW-RECOVERY-KEY', encrypted_mek: 'M', recovery_auth: 'R', encrypted_mek_recovery: 'MR' })
    await login('anna@example.ch', PASSWORD)

    expect(getAuthState().upgradeRecoveryKey).toBe('NEW-RECOVERY-KEY')
    expect(sent('/auth/upgrade')).toHaveLength(0)

    expect(await confirmKeyChange()).toBeNull()
    const [upgrade] = sent('/auth/upgrade')
    expect(upgrade).toMatchObject({ encrypted_mek: 'M', recovery_auth: 'R', encrypted_mek_recovery: 'MR' })
    expect(getAuthState().upgradeRecoveryKey).toBeNull()
  })

  test('an administrator moves at once, with no vault to rewrap', async () => {
    server.version = 1
    server.role = 'admin'
    await login('root@example.ch', PASSWORD)

    expect(initializeVault).not.toHaveBeenCalled()
    expect(Object.keys(sent('/auth/upgrade')[0]).sort()).toEqual(['new_auth_key', 'password'])
  })
})

describe('everywhere else a password used to go', () => {
  test('an invitee sets a password as an auth key derived for their address', async () => {
    await verifyEmail('TOKEN', PASSWORD)

    expect(sent('/auth/invitation')[0]).toEqual({ token: 'TOKEN' })
    expect(Object.keys(sent('/auth/verify-email')[0]).sort()).toEqual(['auth_key', 'token'])
    expect(everyBody()).not.toContain(PASSWORD)
  })

  test("an admin's first password for somebody is sent as that person's auth key", async () => {
    await inviteUser('ben@example.ch', 'user', PASSWORD)

    expect(Object.keys(sent('/auth/invite')[0]).sort()).toEqual(['auth_key', 'email', 'role'])
    expect(everyBody()).not.toContain(PASSWORD)
  })

  test('Profile re-checks send the auth key of a version 2 account', async () => {
    await login('anna@example.ch', PASSWORD)
    await disable2FA(PASSWORD)

    expect(Object.keys(sent('/auth/2fa')[0])).toEqual(['auth_key'])
    expect(everyBody()).not.toContain(PASSWORD)
  })
})

describe('renewing every key', () => {
  test('nothing is sent until the new recovery key is typed back, and then the current key proves it', async () => {
    const { renewKeys, confirmKeyChange } = await import('./authStore.svelte')
    await login('anna@example.ch', PASSWORD)
    fetchMock.mockClear()

    expect(await renewKeys(PASSWORD, 'a different password')).toBeNull()
    expect(getAuthState().upgradeRecoveryKey).toBe('RENEWED-RECOVERY-KEY')
    expect(getAuthState().keyChangeKind).toBe('renewal')
    expect(sent('/auth/renew-keys')).toHaveLength(0)

    expect(await confirmKeyChange()).toBeNull()
    const [body] = sent('/auth/renew-keys')
    expect(body.auth_key).toMatch(/^[A-Za-z0-9+/]{43}=$/)
    expect(body.new_auth_key).toBe('NEW-AUTH-KEY-PLACEHOLDER') // as prepared by the vault store
    expect(body.encrypted_mek).toBe('NEW-MEK')
    expect(everyBody()).not.toContain(PASSWORD)
    expect(getAuthState().upgradeRecoveryKey).toBeNull() // done: the key screen is gone
  })

  test('the same password again is refused before anything is made', async () => {
    const { renewKeys } = await import('./authStore.svelte')
    await login('anna@example.ch', PASSWORD)
    expect(await renewKeys(PASSWORD, PASSWORD)).toContain('AUTH-066')
    expect(getAuthState().upgradeRecoveryKey).toBeNull()
  })
})

describe('a tab left open across the move', () => {
  test('asks the server which form to prove a password in, not its own memory', async () => {
    server.version = 1
    server.upgradeFails = true // so this tab's own upgrade does not happen …
    await login('anna@example.ch', PASSWORD)
    expect(getAuthState().currentUser?.auth_version).toBe(1) // … and it still thinks version 1
    server.version = 2 // while the account moved on another device
    fetchMock.mockClear()

    await disable2FA(PASSWORD)

    expect(Object.keys(sent('/auth/2fa')[0])).toEqual(['auth_key'])
    expect(everyBody()).not.toContain(PASSWORD)
  })
})
