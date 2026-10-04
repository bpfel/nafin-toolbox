import { withCode } from '../api/client'
import { initializeVault, setupKeys, clearVault, reEncryptMEK, recoverVault, tryRestoreVault } from '../crypto/vaultStore.svelte'

export interface User {
  id: number
  email: string
  role: 'admin' | 'user'
  must_change_password: boolean
  email_verified: boolean
  totp_enabled: boolean
  created_at: string
}

export interface AppSettings {
  require_2fa: boolean
  /**
   * Whether invitations go out by email. False on an instance without SMTP,
   * where an invitation needs a first password instead. Optional because a
   * server from before it was reported does not send it.
   */
  email_enabled?: boolean
}

const API_BASE = '/api'

let currentUser = $state<User | null>(null)
let loading = $state(true)
let needsSetup = $state(false)

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
        const restored = await tryRestoreVault()
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

    // Admin users skip vault entirely — they don't use encrypted modules
    if (data.role !== 'admin') {
      // Initialize vault
      const vaultResult = await initializeVault(password, email)
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

    // Admin users skip vault entirely
    if (currentUser && currentUser.role !== 'admin') {
      // Initialize vault using held credentials
      if (heldPassword && heldEmail) {
        const vaultResult = await initializeVault(heldPassword, heldEmail)
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

  const vaultResult = await initializeVault(password, currentUser.email)
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
  if (!heldPassword || !heldEmail) return null

  const recoveryKey = await setupKeys(heldPassword, heldEmail)
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

export async function changePassword(currentPassword: string, newPassword: string): Promise<string | null> {
  // Re-encrypt MEK before changing server password.
  // Skip for admin (no vault) and when must_change_password is set with locked vault
  // (e.g. after admin password reset — vault recovery happens separately).
  if (currentUser && currentUser.role !== 'admin') {
    const mustChangeWithLockedVault = currentUser.must_change_password && vaultDecryptFailed
    if (!mustChangeWithLockedVault) {
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
    currentUser = null
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
    await recoverVault(recoveryKey, heldPassword, heldEmail)
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
        const recoveryKey = await setupKeys(password, email)
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
        const recoveryKey = await setupKeys(password, currentUser.email)
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
