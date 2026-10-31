import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'

// The vault is mocked: what is tested is when keys are stored, and when a
// reload may open the vault without asking.
const store = vi.fn(async () => {})
const prepareSetup = vi.fn(async () => ({ recoveryKey: 'FIRST-RECOVERY-KEY', store }))
const tryRestoreVault = vi.fn(async () => true)
const clearVault = vi.fn()
const state = { recoveryNeedsRenewal: false }

vi.mock('../crypto/vaultStore.svelte', () => ({
  prepareSetup: (...a: unknown[]) => prepareSetup(...(a as [])),
  tryRestoreVault: (...a: unknown[]) => tryRestoreVault(...(a as [])),
  clearVault: () => clearVault(),
  recoveryNeedsRenewal: () => state.recoveryNeedsRenewal,
  initializeVault: vi.fn(async () => 'ok'),
  wrapMEKFor: vi.fn(),
  recoverVault: vi.fn(),
  saveVault: vi.fn(),
  getVaultState: () => ({ dirty: false }),
  prepareUpgrade: vi.fn(),
  upgradeStored: vi.fn(),
  opensVault: vi.fn(async () => true),
  prepareRenewal: vi.fn(),
  renewalStored: vi.fn(),
}))

import { verifyEmail, checkAuth, confirmKeyChange, getAuthState, logout } from './authStore.svelte'

const user = (over: Record<string, unknown> = {}) => ({
  id: 7, email: 'neu@example.ch', role: 'user', must_change_password: false,
  email_verified: true, totp_enabled: false, created_at: '2026-10-31T00:00:00Z', auth_version: 2, ...over,
})

function respond(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

let me = user()

beforeEach(() => {
  vi.clearAllMocks()
  state.recoveryNeedsRenewal = false
  vi.stubGlobal('fetch', vi.fn(async (url: string) =>
    url.endsWith('/auth/invitation') ? respond({ email: me.email, iterations: 1000 })
      : url.endsWith('/auth/verify-email') ? respond(me)
      : url.endsWith('/auth/needs-setup') ? respond({ needs_setup: false })
      : url.endsWith('/auth/me') ? respond(me)
      : respond({}),
  ))
})

afterEach(async () => {
  await logout()
  vi.unstubAllGlobals()
})

// The first recovery key of a new vault was stored before it was shown, and a
// reload on its screen left a vault whose only way back nobody had seen.
describe("a new vault's first recovery key", () => {
  test('is shown before anything is stored, and stored once typed back', async () => {
    me = user()
    await verifyEmail('TOKEN', 'neu-pass-123')

    expect(getAuthState().recoveryKeyToShow).toBe('FIRST-RECOVERY-KEY')
    expect(store).not.toHaveBeenCalled()

    await confirmKeyChange()

    expect(store).toHaveBeenCalledTimes(1)
    expect(getAuthState().recoveryKeyToShow).toBeNull()
  })
})

// A reload restored the vault from the tab's cache, which skipped the move to
// separate keys: the move needs the password, and shows a new recovery key.
describe('a reload before the move to separate keys', () => {
  test('asks for the password rather than opening from the cache', async () => {
    me = user({ auth_version: 1 })
    await checkAuth()

    expect(tryRestoreVault).not.toHaveBeenCalled()
    expect(getAuthState().vaultLocked).toBe(true)
  })

  test('and so does one whose recovery key still has to be replaced', async () => {
    me = user()
    state.recoveryNeedsRenewal = true
    await checkAuth()

    expect(clearVault).toHaveBeenCalled()
    expect(getAuthState().vaultLocked).toBe(true)
  })

  test('an account that has moved opens from the cache as before', async () => {
    me = user()
    await checkAuth()

    expect(tryRestoreVault).toHaveBeenCalled()
    expect(getAuthState().vaultLocked).toBe(false)
  })
})
