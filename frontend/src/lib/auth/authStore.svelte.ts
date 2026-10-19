import { withCode } from '../api/client'
import { passwordChangeProblem } from './rules'
import { initializeVault, initializeVaultWithPasskey, wrapVaultKeyForPasskey, setupKeys, clearVault, reEncryptMEK, recoverVault, tryRestoreVault, saveVault, getVaultState } from '../crypto/vaultStore.svelte'
import { createPasskey, usePasskey, type PasskeyAnswer } from './passkey'

export interface User {
  id: number
  email: string
  role: 'admin' | 'user'
  must_change_password: boolean
  email_verified: boolean
  totp_enabled: boolean
  created_at: string
  /**
   * This session was started with a passkey, which is two factors already, so
   * an instance that requires 2FA does not stop it for an authenticator app.
   * Optional: only /auth/me and a passkey sign-in report it.
   */
  passkey_session?: boolean
}

export interface AppSettings {
  require_2fa: boolean
  /**
   * Whether invitations go out by email. False on an instance without SMTP,
   * where an invitation needs a first password instead. Optional because a
   * server from before it was reported does not send it.
   */
  email_enabled?: boolean
  /** An administrator has allowed passkeys on this instance. */
  allow_passkeys?: boolean
  /** The app's address can carry passkeys at all: a name, not an IP. */
  passkeys_possible?: boolean
}

/** One of the signed-in account's passkeys. */
export interface Passkey {
  id: number
  name: string
  created_at: string
  last_used_at: string | null
  /** Opens the vault as well as signing in. */
  unlocks: boolean
}

const API_BASE = '/api'

let currentUser = $state<User | null>(null)
let loading = $state(true)
let needsSetup = $state(false)
// An administrator has allowed passkeys, so the sign-in screen offers one.
let passkeysOffered = $state(false)

// Held credentials for vault initialization (cleared after use)
let heldPassword = $state<string | null>(null)
let heldEmail = $state<string | null>(null)

// Vault state exposed to UI
let vaultNeedsSetup = $state(false)
let vaultDecryptFailed = $state(false)
let recoveryKeyToShow = $state<string | null>(null)
let vaultLocked = $state(false)

export function getAuthState() {
  return {
    get currentUser() { return currentUser },
    get loading() { return loading },
    get needsSetup() { return needsSetup },
    get passkeysOffered() { return passkeysOffered },
    get vaultNeedsSetup() { return vaultNeedsSetup },
    get vaultDecryptFailed() { return vaultDecryptFailed },
    get vaultLocked() { return vaultLocked },
    get recoveryKeyToShow() { return recoveryKeyToShow },
  }
}

export function clearRecoveryKey() {
  recoveryKeyToShow = null
}

export async function checkAuth() {
  loading = true
  try {
    const setupRes = await fetch(`${API_BASE}/auth/needs-setup`, { credentials: 'include' })
    if (setupRes.ok) {
      const data = await setupRes.json()
      needsSetup = data.needs_setup
      passkeysOffered = data.passkeys === true
      if (needsSetup) {
        currentUser = null
        return
      }
    }

    const res = await fetch(`${API_BASE}/auth/me`, { credentials: 'include' })
    if (res.ok) {
      currentUser = await res.json()
      // Admin users skip vault entirely — they don't use encrypted modules
      if (currentUser && currentUser.role !== 'admin') {
        // Try to restore vault from sessionStorage (survives page refresh)
        const restored = await tryRestoreVault(currentUser.id)
        if (!restored) {
          vaultLocked = true
        }
      }
    } else {
      currentUser = null
    }
  } catch {
    currentUser = null
  } finally {
    loading = false
  }
}

export async function login(email: string, password: string): Promise<string | { requires_2fa: true; mfa_token: string } | null> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ email, password }),
  })

  if (res.ok) {
    const data = await res.json()
    if (data.requires_2fa) {
      // Hold password for vault init after 2FA
      heldPassword = password
      heldEmail = email
      return { requires_2fa: true, mfa_token: data.mfa_token }
    }
    currentUser = data
    vaultLocked = false
    // Whatever the vault said about the last account in this tab says nothing
    // about this one. changePassword trusts vaultNeedsSetup to mean "no keys",
    // and a stale true would skip re-wrapping a vault that has them.
    vaultNeedsSetup = false
    vaultDecryptFailed = false

    // Admin users skip vault entirely — they don't use encrypted modules
    if (data.role !== 'admin') {
      // Initialize vault
      const vaultResult = await initializeVault(password, email, data.id)
      if (vaultResult === 'no-keys') {
        // Keys don't exist yet — need setup
        heldPassword = password
        heldEmail = email
        vaultNeedsSetup = true
      } else if (vaultResult === 'decrypt-failed') {
        // Keys exist but can't decrypt — need recovery
        heldPassword = password
        heldEmail = email
        vaultDecryptFailed = true
      }
    }

    return null
  }

  const data = await res.json().catch(() => ({ error: 'Login failed' }))
  return withCode(data) || 'Login failed'
}

export async function verify2FA(mfaToken: string, code: string): Promise<string | null> {
  const res = await fetch(`${API_BASE}/auth/verify-2fa`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ mfa_token: mfaToken, code }),
  })

  if (res.ok) {
    currentUser = await res.json()
    vaultLocked = false
    // As in login: start from what this account's vault says.
    vaultNeedsSetup = false
    vaultDecryptFailed = false

    // Admin users skip vault entirely
    if (currentUser && currentUser.role !== 'admin') {
      // Initialize vault using held credentials
      if (heldPassword && heldEmail) {
        const vaultResult = await initializeVault(heldPassword, heldEmail, currentUser.id)
        if (vaultResult === 'no-keys') {
          vaultNeedsSetup = true
        } else if (vaultResult === 'decrypt-failed') {
          vaultDecryptFailed = true
        }
      }
    }
    // Clear held credentials if vault is ready
    if (!vaultNeedsSetup && !vaultDecryptFailed) {
      heldPassword = null
      heldEmail = null
    }

    return null
  }

  const data = await res.json().catch(() => ({ error: 'Verification failed' }))
  return withCode(data) || 'Verification failed'
}

/**
 * Unlock vault on page refresh (user has session but vault is locked).
 * Returns error string or null on success.
 */
export async function unlockVault(password: string): Promise<string | null> {
  if (!currentUser) return 'Not logged in'

  const vaultResult = await initializeVault(password, currentUser.email, currentUser.id)
  if (vaultResult === 'ok') {
    vaultLocked = false
    return null
  } else if (vaultResult === 'no-keys') {
    // Keys don't exist yet — need setup
    heldPassword = password
    heldEmail = currentUser.email
    vaultNeedsSetup = true
    vaultLocked = false
    return null
  } else {
    // decrypt-failed — need recovery
    heldPassword = password
    heldEmail = currentUser.email
    vaultDecryptFailed = true
    vaultLocked = false
    return null
  }
}

/**
 * Complete vault key setup (after login when keys don't exist yet).
 * Returns the recovery key to show to the user.
 */
export async function completeVaultSetup(): Promise<string | null> {
  if (!heldPassword || !heldEmail || !currentUser) return null

  const recoveryKey = await setupKeys(heldPassword, heldEmail, currentUser.id)
  heldPassword = null
  heldEmail = null
  vaultNeedsSetup = false
  recoveryKeyToShow = recoveryKey
  return recoveryKey
}

let loggingOut = false

export async function logout() {
  if (loggingOut) return
  loggingOut = true
  try {
    clearVault()
    await fetch(`${API_BASE}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    })
  } finally {
    currentUser = null
    heldPassword = null
    heldEmail = null
    vaultNeedsSetup = false
    vaultDecryptFailed = false
    vaultLocked = false
    recoveryKeyToShow = null
    loggingOut = false
  }
}

/**
 * Sign out on every device this account is signed in on, this one included.
 *
 * For a lost phone, or a computer left signed in somewhere. Anything unsaved
 * here is saved first, while this session can still save it; then every
 * session goes at once, and this tab forgets it as an ordinary sign-out does.
 */
export async function logoutEverywhere(): Promise<boolean> {
  if (getVaultState().dirty) await saveVault()
  const res = await fetch(`${API_BASE}/auth/logout-everywhere`, {
    method: 'POST',
    credentials: 'include',
  })
  if (!res.ok) return false
  await logout()
  return true
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<string | null> {
  // Re-encrypt MEK before changing server password.
  // Skip for admin (no vault) and when must_change_password is set with locked vault
  // (e.g. after admin password reset — vault recovery happens separately).
  //
  // Skip too when there is no vault yet. An account an admin created with a
  // first password, on an instance without email, is made to change it before
  // anything else — before a vault exists to hold a key. There is nothing to
  // re-encrypt, and the vault is set up afterwards under the new password.
  // Without this, that change failed with "Vault not unlocked" and the account
  // could never get past it.
  // Before anything else: the vault key is re-wrapped under the new password
  // first, and a password the server then refused would leave it there.
  const problem = passwordChangeProblem(currentPassword, newPassword)
  if (problem) return problem

  if (currentUser && currentUser.role !== 'admin') {
    const mustChangeWithLockedVault = currentUser.must_change_password && vaultDecryptFailed
    if (!mustChangeWithLockedVault && !vaultNeedsSetup) {
      try {
        await reEncryptMEK(currentPassword, newPassword, currentUser.email)
      } catch (e) {
        return e instanceof Error ? e.message : 'Failed to re-encrypt vault keys'
      }
    }
  }

  const res = await fetch(`${API_BASE}/auth/change-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  })

  if (res.ok) {
    // Signed out, as by logout, and with the same state cleared: the old
    // password must not stay held for a vault setup, nor the flags outlive
    // the session they described.
    currentUser = null
    heldPassword = null
    heldEmail = null
    vaultNeedsSetup = false
    vaultDecryptFailed = false
    clearVault()
    return null
  }

  const data = await res.json().catch(() => ({ error: 'Password change failed' }))
  return withCode(data) || 'Password change failed'
}

/**
 * Recover account using recovery key.
 * User must be logged in (auth session active) but vault is locked.
 * Uses held password to re-wrap MEK after recovery.
 */
export async function recoverAccount(recoveryKey: string): Promise<string | null> {
  if (!currentUser) return 'Not logged in'
  if (!heldPassword || !heldEmail) return 'Password not available for re-encryption'

  try {
    await recoverVault(recoveryKey, heldPassword, heldEmail, currentUser.id)
    heldPassword = null
    heldEmail = null
    vaultDecryptFailed = false
  } catch (e) {
    return e instanceof Error ? e.message : 'Recovery failed'
  }

  return null
}

export async function inviteUser(email: string, role: 'admin' | 'user' = 'user', password?: string): Promise<{ user?: User; error?: string }> {
  const body: any = { email, role }
  if (password) body.password = password

  const res = await fetch(`${API_BASE}/auth/invite`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  })

  if (res.ok) {
    return { user: await res.json() }
  }

  const data = await res.json().catch(() => ({ error: 'Invite failed' }))
  return { error: withCode(data) || 'Invite failed' }
}

export async function listUsers(): Promise<User[]> {
  const res = await fetch(`${API_BASE}/auth/users`, { credentials: 'include' })
  if (res.ok) {
    return res.json()
  }
  return []
}

export async function setup(email: string, password: string): Promise<string | null> {
  const res = await fetch(`${API_BASE}/auth/setup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ email, password }),
  })

  if (res.ok) {
    currentUser = await res.json()
    needsSetup = false

    // Admin (first account) skips vault — no encryption keys needed
    if (currentUser && currentUser.role !== 'admin') {
      // Set up vault keys for the new user
      try {
        const recoveryKey = await setupKeys(password, email, currentUser.id)
        recoveryKeyToShow = recoveryKey
      } catch {
        // If key setup fails, user can still unlock later via the vault lock screen
        vaultLocked = true
      }
    }
    return null
  }

  const data = await res.json().catch(() => ({ error: 'Setup failed' }))
  return withCode(data) || 'Setup failed'
}

export async function verifyEmail(token: string, password: string): Promise<string | null> {
  const res = await fetch(`${API_BASE}/auth/verify-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ token, password }),
  })

  if (res.ok) {
    currentUser = await res.json()

    // Set up vault keys for the invited user (admin users skip vault)
    if (currentUser && currentUser.role !== 'admin') {
      try {
        const recoveryKey = await setupKeys(password, currentUser.email, currentUser.id)
        recoveryKeyToShow = recoveryKey
      } catch {
        vaultLocked = true
      }
    }
    return null
  }

  const data = await res.json().catch(() => ({ error: 'Verification failed' }))
  return withCode(data) || 'Verification failed'
}

export async function setup2FA(): Promise<{ secret: string; url: string } | { error: string }> {
  const res = await fetch(`${API_BASE}/auth/2fa/setup`, {
    method: 'POST',
    credentials: 'include',
  })

  if (res.ok) {
    return res.json()
  }

  const data = await res.json().catch(() => ({ error: '2FA setup failed' }))
  return { error: withCode(data) || '2FA setup failed' }
}

export async function confirm2FA(code: string): Promise<{ recovery_codes: string[] } | { error: string }> {
  const res = await fetch(`${API_BASE}/auth/2fa/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ code }),
  })

  if (res.ok) {
    return res.json()
  }

  const data = await res.json().catch(() => ({ error: 'Confirmation failed' }))
  return { error: withCode(data) || 'Confirmation failed' }
}

export async function disable2FA(password: string): Promise<string | null> {
  const res = await fetch(`${API_BASE}/auth/2fa`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ password }),
  })

  if (res.ok) return null

  const data = await res.json().catch(() => ({ error: 'Failed to disable 2FA' }))
  return withCode(data) || 'Failed to disable 2FA'
}

export async function regenerateRecoveryCodes(password: string): Promise<{ recovery_codes: string[] } | { error: string }> {
  const res = await fetch(`${API_BASE}/auth/2fa/recovery-codes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ password }),
  })

  if (res.ok) {
    return res.json()
  }

  const data = await res.json().catch(() => ({ error: 'Failed to regenerate codes' }))
  return { error: withCode(data) || 'Failed to regenerate codes' }
}

export async function deleteAccount(password: string): Promise<string | null> {
  const res = await fetch(`${API_BASE}/auth/account`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ password }),
  })

  if (res.ok) {
    clearVault()
    currentUser = null
    return null
  }

  const data = await res.json().catch(() => ({ error: 'Failed to delete account' }))
  return withCode(data) || 'Failed to delete account'
}

export async function deleteUser(id: number): Promise<string | null> {
  const res = await fetch(`${API_BASE}/auth/users/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  })

  if (res.ok) return null

  const data = await res.json().catch(() => ({ error: 'Failed to delete user' }))
  return withCode(data) || 'Failed to delete user'
}

export async function adminResetPassword(id: number): Promise<{ temp_password: string } | { error: string }> {
  const res = await fetch(`${API_BASE}/auth/users/${id}/reset-password`, {
    method: 'POST',
    credentials: 'include',
  })

  const data = await res.json().catch(() => ({ error: 'Failed to reset password' }))
  if (res.ok) return { temp_password: data.temp_password }
  return { error: withCode(data) || 'Failed to reset password' }
}

export async function resendVerification(id: number): Promise<string | null> {
  const res = await fetch(`${API_BASE}/auth/resend-verification/${id}`, {
    method: 'POST',
    credentials: 'include',
  })

  if (res.ok) return null

  const data = await res.json().catch(() => ({ error: 'Failed to resend' }))
  return withCode(data) || 'Failed to resend'
}

export interface AuditLogEntry {
  id: number
  user_id: number | null
  user_email: string | null
  event: string
  ip_address: string
  user_agent: string
  metadata: Record<string, any> | null
  created_at: string
}

export interface AuditLogResponse {
  entries: AuditLogEntry[]
  total: number
}

export async function fetchAuditLogs(params: {
  limit?: number
  offset?: number
  event?: string
  user_id?: number
} = {}): Promise<AuditLogResponse> {
  const searchParams = new URLSearchParams()
  if (params.limit) searchParams.set('limit', String(params.limit))
  if (params.offset) searchParams.set('offset', String(params.offset))
  if (params.event) searchParams.set('event', params.event)
  if (params.user_id !== undefined) searchParams.set('user_id', String(params.user_id))

  const qs = searchParams.toString()
  const res = await fetch(`${API_BASE}/auth/audit-logs${qs ? '?' + qs : ''}`, { credentials: 'include' })
  if (res.ok) return res.json()
  return { entries: [], total: 0 }
}

export async function getSettings(): Promise<AppSettings> {
  const res = await fetch(`${API_BASE}/auth/settings`, { credentials: 'include' })
  if (res.ok) return res.json()
  return { require_2fa: false }
}

export async function setRequire2FA(require: boolean): Promise<string | null> {
  const res = await fetch(`${API_BASE}/auth/settings/require-2fa`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ require }),
  })

  if (res.ok) return null

  const data = await res.json().catch(() => ({ error: 'Failed to update setting' }))
  return withCode(data) || 'Failed to update setting'
}

// ---- Passkeys ----

async function post(path: string, body?: unknown): Promise<Response> {
  return fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

async function failure(res: Response, fallback: string): Promise<string> {
  const data = await res.json().catch(() => ({ error: fallback }))
  return withCode(data) || fallback
}

/**
 * Sign in with a passkey: one prompt, no email, no TOTP.
 *
 * If the passkey can open the vault, it is opened with the secret from the
 * same prompt; otherwise the lock screen asks for the password, as after a
 * reload. A passkey that fails to open the vault does the same rather than
 * reporting the vault broken — the password still opens it.
 *
 * With `signal`, it waits in the email field's autofill rather than opening
 * a prompt. Returns null on success, 'cancelled' if nobody chose a passkey,
 * or an error to show.
 */
export async function signInWithPasskey(signal?: AbortSignal): Promise<string | 'cancelled' | null> {
  const begin = await post('/auth/passkeys/login/begin')
  if (!begin.ok) return failure(begin, 'Passkey sign-in failed')
  const { token, options } = await begin.json()

  let used: PasskeyAnswer | null
  try {
    used = await usePasskey(options, { signal, conditional: !!signal })
  } catch (e) {
    return e instanceof Error ? e.message : 'Passkey sign-in failed'
  }
  if (!used) return 'cancelled'

  const res = await post('/auth/passkeys/login/finish', { token, credential: used.credential })
  if (!res.ok) return failure(res, 'Passkey sign-in failed')
  const data: { user: User; encrypted_mek_prf: string | null } = await res.json()

  currentUser = data.user
  heldPassword = null
  heldEmail = null
  vaultNeedsSetup = false
  vaultDecryptFailed = false
  vaultLocked = false

  if (data.user.role !== 'admin') {
    const opened = data.encrypted_mek_prf && used.secret
      ? await initializeVaultWithPasskey(data.encrypted_mek_prf, used.secret, data.user.id)
      : 'locked'
    if (opened !== 'ok') vaultLocked = opened !== 'version-ahead'
  }
  return null
}

/**
 * Open a locked vault with a passkey, for someone already signed in. Returns
 * null once it is open, 'cancelled', or an error to show.
 */
export async function unlockWithPasskey(): Promise<string | 'cancelled' | null> {
  if (!currentUser) return 'Not logged in'
  const result = await askPasskey()
  if (typeof result === 'string') return result
  if (!result.wrap || !result.secret) return 'cancelled'

  const opened = await initializeVaultWithPasskey(result.wrap, result.secret, currentUser.id)
  if (opened === 'ok') {
    vaultLocked = false
    return null
  }
  return opened === 'version-ahead' ? null : 'Passkey unlock failed'
}

/**
 * A fingerprint prompt for the signed-in account: any passkey that opens the
 * vault, or the one given. Returns its wrap of the vault key and its PRF
 * secret, either of which may be missing.
 */
async function askPasskey(passkeyId?: number): Promise<{ id: number; wrap: string | null; secret: Uint8Array | null } | string> {
  const begin = await post('/auth/passkeys/unlock/begin', passkeyId ? { passkey_id: passkeyId } : undefined)
  if (!begin.ok) return failure(begin, 'Passkey unlock failed')
  const { token, options } = await begin.json()

  let used: PasskeyAnswer | null
  try {
    used = await usePasskey(options)
  } catch (e) {
    return e instanceof Error ? e.message : 'Passkey unlock failed'
  }
  if (!used) return 'cancelled'

  const res = await post('/auth/passkeys/unlock/finish', { token, credential: used.credential })
  if (!res.ok) return failure(res, 'Passkey unlock failed')
  const data: { passkey_id: number; encrypted_mek_prf: string | null } = await res.json()
  return { id: data.passkey_id, wrap: data.encrypted_mek_prf, secret: used.secret }
}

export async function listPasskeys(): Promise<Passkey[]> {
  const res = await fetch(`${API_BASE}/auth/passkeys`, { credentials: 'include' })
  return res.ok ? res.json() : []
}

/**
 * Add a passkey to this account, after the password.
 *
 * Then, if the account has a vault, make the passkey able to open it: wrap the
 * vault key under its PRF secret and store the wrap. Some authenticators give
 * the secret when the passkey is made; others only when it is first used, so
 * a second prompt follows if the first brought none. A passkey that gives no
 * secret at all still signs in, and the list says it does not open the budget.
 *
 * Returns the passkey, 'cancelled', or an error to show.
 */
export async function addPasskey(password: string, name: string): Promise<Passkey | 'cancelled' | string> {
  const begin = await post('/auth/passkeys/register/begin', { password })
  if (!begin.ok) return failure(begin, 'Could not add a passkey')
  const { token, options } = await begin.json()

  let made: PasskeyAnswer | null
  try {
    made = await createPasskey(options)
  } catch (e) {
    return e instanceof Error ? e.message : 'Could not add a passkey'
  }
  if (!made) return 'cancelled'

  const res = await post('/auth/passkeys/register/finish', { token, name, credential: made.credential })
  if (!res.ok) return failure(res, 'Could not add a passkey')
  const passkey: Passkey = await res.json()

  if (currentUser?.role === 'admin') return passkey

  let secret = made.secret
  if (!secret) {
    const asked = await askPasskey(passkey.id)
    if (typeof asked !== 'string') secret = asked.secret
  }
  const wrap = secret ? await wrapVaultKeyForPasskey(secret) : null
  if (wrap) {
    const put = await fetch(`${API_BASE}/auth/passkeys/${passkey.id}/vault-key`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ encrypted_mek_prf: wrap }),
    })
    if (put.ok) passkey.unlocks = true
  }
  return passkey
}

/**
 * Remove one of this account's passkeys. Any session it started ends with it;
 * if that was this one, the next request signs this tab out.
 */
export async function removePasskey(id: number): Promise<string | null> {
  const res = await fetch(`${API_BASE}/auth/passkeys/${id}`, { method: 'DELETE', credentials: 'include' })
  return res.ok ? null : failure(res, 'Could not remove the passkey')
}

export async function setAllowPasskeys(allow: boolean): Promise<string | null> {
  const res = await post('/auth/settings/allow-passkeys', { allow })
  return res.ok ? null : failure(res, 'Failed to update setting')
}
