import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'

// The vault and the browser are mocked: these tests are about what the store
// does with a passkey's answer, not about the cryptography or the ceremony.
const initializeVaultWithPasskey = vi.fn()
const wrapVaultKeyForPasskey = vi.fn()
const createPasskey = vi.fn()
const usePasskey = vi.fn()

vi.mock('../crypto/vaultStore.svelte', () => ({
  initializeVault: vi.fn(),
  initializeVaultWithPasskey: (...a: unknown[]) => initializeVaultWithPasskey(...a),
  wrapVaultKeyForPasskey: (...a: unknown[]) => wrapVaultKeyForPasskey(...a),
  reEncryptMEK: vi.fn(),
  setupKeys: vi.fn(),
  clearVault: vi.fn(),
  recoverVault: vi.fn(),
  tryRestoreVault: vi.fn(),
  saveVault: vi.fn(),
  getVaultState: () => ({ dirty: false }),
}))

vi.mock('./passkey', () => ({
  createPasskey: (...a: unknown[]) => createPasskey(...a),
  usePasskey: (...a: unknown[]) => usePasskey(...a),
}))

import { signInWithPasskey, addPasskey, unlockWithPasskey, getAuthState } from './authStore.svelte'

const anna = {
  id: 5, email: 'anna@example.ch', role: 'user', must_change_password: false,
  email_verified: true, totp_enabled: false, created_at: '2026-10-04T00:00:00Z', passkey_session: true,
}
const secret = new Uint8Array(32).fill(7)
const answer = (withSecret: boolean) => ({ credential: { id: 'x' }, secret: withSecret ? secret : null })

function respond(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

/** A server answering each passkey endpoint the way the test sets up. */
function server(routes: Record<string, unknown>) {
  const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
    const path = url.replace('/api', '')
    const key = Object.keys(routes).find(k => path === k || path.startsWith(k))
    return key ? respond(routes[key]) : respond({ error: 'not found' }, 404)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const ceremony = { token: 't', options: { publicKey: { challenge: 'AA' } } }

describe('signing in with a passkey', () => {
  beforeEach(() => {
    initializeVaultWithPasskey.mockReset()
    usePasskey.mockReset()
  })
  afterEach(() => vi.unstubAllGlobals())

  test('a passkey that opens the vault opens it in the same prompt', async () => {
    server({
      '/auth/passkeys/login/begin': ceremony,
      '/auth/passkeys/login/finish': { user: anna, encrypted_mek_prf: 'wrap' },
    })
    usePasskey.mockResolvedValue(answer(true))
    initializeVaultWithPasskey.mockResolvedValue('ok')

    expect(await signInWithPasskey()).toBeNull()
    expect(initializeVaultWithPasskey).toHaveBeenCalledWith('wrap', secret, anna.id)
    expect(getAuthState().currentUser?.passkey_session).toBe(true)
    expect(getAuthState().vaultLocked).toBe(false)
  })

  test('one that only signs in leaves the vault to the password', async () => {
    server({
      '/auth/passkeys/login/begin': ceremony,
      '/auth/passkeys/login/finish': { user: anna, encrypted_mek_prf: null },
    })
    usePasskey.mockResolvedValue(answer(false))

    expect(await signInWithPasskey()).toBeNull()
    expect(initializeVaultWithPasskey).not.toHaveBeenCalled()
    expect(getAuthState().vaultLocked).toBe(true)
  })

  test('a wrap that will not open falls back to the password, not to recovery', async () => {
    server({
      '/auth/passkeys/login/begin': ceremony,
      '/auth/passkeys/login/finish': { user: anna, encrypted_mek_prf: 'wrap' },
    })
    usePasskey.mockResolvedValue(answer(true))
    initializeVaultWithPasskey.mockResolvedValue('decrypt-failed')

    expect(await signInWithPasskey()).toBeNull()
    expect(getAuthState().vaultLocked).toBe(true)
    expect(getAuthState().vaultDecryptFailed).toBe(false)
  })

  test('nobody choosing a passkey is "cancelled", and nobody is signed in', async () => {
    const fetchMock = server({ '/auth/passkeys/login/begin': ceremony })
    usePasskey.mockResolvedValue(null)

    expect(await signInWithPasskey()).toBe('cancelled')
    expect(fetchMock).not.toHaveBeenCalledWith('/api/auth/passkeys/login/finish', expect.anything())
  })
})

describe('adding a passkey', () => {
  beforeEach(() => {
    createPasskey.mockReset()
    usePasskey.mockReset()
    wrapVaultKeyForPasskey.mockReset().mockResolvedValue('wrapped-key')
  })
  afterEach(() => vi.unstubAllGlobals())

  const added = { id: 3, name: 'iPhone', created_at: '', last_used_at: null, unlocks: false }

  test('a secret at creation is used to store a vault key straight away', async () => {
    const fetchMock = server({
      '/auth/passkeys/register/begin': ceremony,
      '/auth/passkeys/register/finish': added,
      '/auth/passkeys/3/vault-key': { status: 'ok' },
    })
    createPasskey.mockResolvedValue(answer(true))

    const result = await addPasskey('pw', 'iPhone')

    expect(result).toMatchObject({ id: 3, unlocks: true })
    expect(usePasskey).not.toHaveBeenCalled()
    expect(wrapVaultKeyForPasskey).toHaveBeenCalledWith(secret)
    const put = fetchMock.mock.calls.find(([u]) => String(u).endsWith('/vault-key'))
    expect(JSON.parse(put![1]!.body as string)).toEqual({ encrypted_mek_prf: 'wrapped-key' })
  })

  test('no secret at creation asks the new passkey once more', async () => {
    server({
      '/auth/passkeys/register/begin': ceremony,
      '/auth/passkeys/register/finish': added,
      '/auth/passkeys/unlock/begin': ceremony,
      '/auth/passkeys/unlock/finish': { passkey_id: 3, encrypted_mek_prf: null },
      '/auth/passkeys/3/vault-key': { status: 'ok' },
    })
    createPasskey.mockResolvedValue(answer(false))
    usePasskey.mockResolvedValue(answer(true))

    const result = await addPasskey('pw', 'iPhone')

    expect(usePasskey).toHaveBeenCalledOnce()
    expect(result).toMatchObject({ unlocks: true })
  })

  test('a passkey with no PRF at all is kept, as one that only signs in', async () => {
    const fetchMock = server({
      '/auth/passkeys/register/begin': ceremony,
      '/auth/passkeys/register/finish': added,
      '/auth/passkeys/unlock/begin': ceremony,
      '/auth/passkeys/unlock/finish': { passkey_id: 3, encrypted_mek_prf: null },
    })
    createPasskey.mockResolvedValue(answer(false))
    usePasskey.mockResolvedValue(answer(false))

    const result = await addPasskey('pw', 'iPhone')

    expect(result).toMatchObject({ id: 3, unlocks: false })
    expect(fetchMock.mock.calls.some(([u]) => String(u).endsWith('/vault-key'))).toBe(false)
  })

  test('a wrong password stops before any prompt', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respond({ error: 'incorrect password', code: 'AUTH-015' }, 401)))
    const result = await addPasskey('wrong', 'iPhone')
    expect(typeof result).toBe('string')
    expect(result).toContain('AUTH-015')
    expect(createPasskey).not.toHaveBeenCalled()
  })
})

describe('unlocking with a passkey', () => {
  afterEach(() => vi.unstubAllGlobals())

  test('opens the vault with the wrap and secret the prompt brought', async () => {
    server({
      '/auth/passkeys/login/begin': ceremony,
      '/auth/passkeys/login/finish': { user: anna, encrypted_mek_prf: null },
    })
    usePasskey.mockResolvedValue(answer(false))
    await signInWithPasskey()
    expect(getAuthState().vaultLocked).toBe(true)

    server({
      '/auth/passkeys/unlock/begin': ceremony,
      '/auth/passkeys/unlock/finish': { passkey_id: 3, encrypted_mek_prf: 'wrap' },
    })
    usePasskey.mockResolvedValue(answer(true))
    initializeVaultWithPasskey.mockReset().mockResolvedValue('ok')

    expect(await unlockWithPasskey()).toBeNull()
    expect(initializeVaultWithPasskey).toHaveBeenCalledWith('wrap', secret, anna.id)
    expect(getAuthState().vaultLocked).toBe(false)
  })
})
