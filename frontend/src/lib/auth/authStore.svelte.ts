import { withCode } from '../api/client'
import { passwordChangeProblem, passwordProblem } from './rules'
import { initializeVault, setupKeys, clearVault, reEncryptMEK, recoverVault, tryRestoreVault, saveVault, getVaultState, prepareUpgrade, recoveryNeedsRenewal, upgradeStored, prepareRenewal, renewalStored, opensVault } from '../crypto/vaultStore.svelte'
import { derivePasswordKeys, type PasswordKeys } from '../crypto/keys'

export interface User {
  id: number
  email: string
  role: 'admin' | 'user'
  must_change_password: boolean
  email_verified: boolean
  totp_enabled: boolean
  created_at: string
  /**
   * 1: signs in with the password itself, which also derived the vault key;
   * 2: with an auth key derived from it here. Absent from a server before key
   * separation, which is version 1 by definition.
   */
  auth_version?: number
}

export interface AppSettings {
  require_2fa: boolean
  /**
   * Whether invitations go out by email. False on an instance without SMTP,
   * where an invitation needs a first password instead. Optional because a
   * server from before it was reported does not send it.
   */
  email_enabled?: boolean
  /**
   * Whether 2FA can be turned on here at all (the server has an encryption
   * key). Optional for the same reason as email_enabled; absent is read as
   * yes, which is every server that ever offered 2FA.
   */
  twofa_available?: boolean
}

const API_BASE = '/api'

let currentUser = $state<User | null>(null)
let loading = $state(true)
let needsSetup = $state(false)

// Held between steps (2FA, vault setup, recovery), and cleared after use: the
// keys a password stands for, never the password — except for a version 1
// account, whose password is the proof its one upgrade needs.
let heldKeys: PasswordKeys | null = null
let heldPassword = $state<string | null>(null)
let heldEmail = $state<string | null>(null)

// A change of keys waiting for its new recovery key to be written down: the
// move to separate keys (offerUpgrade) or a renewal (renewKeys). Nothing is
// sent until it has been typed back; `commit` then sends it.
interface PendingKeyChange {
  kind: 'upgrade' | 'renewal'
  recoveryKey: string
  commit: () => Promise<string | null>
}
let pendingKeyChange = $state<PendingKeyChange | null>(null)

// Set once a renewal has been stored, so Profile can say so.
let keysRenewed = $state(false)

/** What a new account's keys are derived with; prelogin answers the same for unknown addresses. */
const DEFAULT_ITERATIONS = 600000

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
    get upgradeRecoveryKey() { return pendingKeyChange?.recoveryKey ?? null },
    get keyChangeKind() { return pendingKeyChange?.kind ?? null },
    get keysRenewed() { return keysRenewed },
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

// --- Keys instead of passwords (see plans/key-separation-plan.md) ---
//
// The password never leaves this tab for a version 2 account: the server gets
// the auth key derived from it, and the vault is unwrapped with a sibling key
// it never sees. A version 1 account still sends its password, once more, and
// is upgraded right after.

async function prelogin(email: string): Promise<{ auth_version: number; iterations: number }> {
  const res = await fetch(`${API_BASE}/auth/prelogin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ email }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: 'Login failed' }))
    throw new Error(withCode(data) || 'Login failed')
  }
  return res.json()
}

function versionOf(user: User | null): number {
  return user?.auth_version ?? 1
}

/** The proof of a password in the signed-in account's own form. */
async function proofFor(password: string): Promise<{ password: string } | { auth_key: string }> {
  if (!currentUser) throw new Error('Not logged in')
  if (versionOf(currentUser) < 2) return { password }
  const { iterations } = await prelogin(currentUser.email)
  return { auth_key: (await derivePasswordKeys(password, currentUser.email, iterations)).authKey }
}

export async function login(email: string, password: string): Promise<string | { requires_2fa: true; mfa_token: string } | null> {
  let pre: { auth_version: number; iterations: number }
  try {
    pre = await prelogin(email)
  } catch (e) {
    return e instanceof Error ? e.message : 'Login failed'
  }
  const keys = await derivePasswordKeys(password, email, pre.iterations)

  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(pre.auth_version >= 2 ? { email, auth_key: keys.authKey } : { email, password }),
  })

  if (res.ok) {
    const data = await res.json()
    if (data.requires_2fa) {
      // Held for the vault and the upgrade, after the second factor.
      heldKeys = keys
      heldPassword = pre.auth_version >= 2 ? null : password
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
    await afterSignIn(keys, password, email)
    return null
  }

  const data = await res.json().catch(() => ({ error: 'Login failed' }))
  return withCode(data) || 'Login failed'
}

/**
 * Open the vault after signing in, and move a version 1 account to version 2.
 * `password` is needed only as that upgrade's proof.
 */
async function afterSignIn(keys: PasswordKeys, password: string | null, email: string): Promise<void> {
  if (!currentUser) return
  const version = versionOf(currentUser)

  // An administrator has no vault, so only the password moves.
  if (currentUser.role === 'admin') {
    if (version < 2 && password) await upgradeNow({ password, new_auth_key: keys.authKey })
    return
  }

  const vaultResult = await initializeVault(keys, currentUser.id, version)
  if (vaultResult === 'no-keys') {
    // No vault yet: the password moves now, and the vault is set up under
    // the version 2 key.
    if (version < 2 && password) await upgradeNow({ password, new_auth_key: keys.authKey })
    heldKeys = keys
    heldEmail = email
    vaultNeedsSetup = true
  } else if (vaultResult === 'decrypt-failed') {
    // Keys exist but this password does not open them — need recovery.
    heldKeys = keys
    heldPassword = version < 2 ? password : null
    heldEmail = email
    vaultDecryptFailed = true
  } else if (vaultResult === 'ok') {
    await offerUpgrade(keys, password)
  }
}

/**
 * Upgrade what this account still lacks of version 2, now that its vault is
 * open. A new recovery key is involved whenever the old one is one the server
 * received; then nothing is sent until it has been written down and typed back
 * (confirmKeyChange). Otherwise the upgrade goes at once.
 */
async function offerUpgrade(keys: PasswordKeys, password: string | null): Promise<void> {
  if (!currentUser) return
  const needsAuth = versionOf(currentUser) < 2
  const needsRecovery = recoveryNeedsRenewal()
  if (!needsAuth && !needsRecovery) return
  if (needsAuth && !password) return

  const prepared = await prepareUpgrade(keys, needsAuth, needsRecovery)
  const body: Record<string, string> = needsAuth
    ? { password: password!, new_auth_key: keys.authKey }
    : { auth_key: keys.authKey }
  if (prepared.encrypted_mek) body.encrypted_mek = prepared.encrypted_mek
  if (prepared.recovery_auth && prepared.encrypted_mek_recovery) {
    body.recovery_auth = prepared.recovery_auth
    body.encrypted_mek_recovery = prepared.encrypted_mek_recovery
  }
  if (prepared.recoveryKey) {
    pendingKeyChange = { kind: 'upgrade', recoveryKey: prepared.recoveryKey, commit: () => upgradeNow(body) }
    return
  }
  await upgradeNow(body)
}

/** Send an upgrade. A failure leaves the account as it was; the next sign-in tries again. */
async function upgradeNow(body: Record<string, string>): Promise<string | null> {
  const res = await fetch(`${API_BASE}/auth/upgrade`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  })
  if (res.ok) {
    currentUser = await res.json()
    upgradeStored(body.recovery_auth !== undefined)
    return null
  }
  const data = await res.json().catch(() => ({ error: 'Upgrade failed' }))
  return withCode(data) || 'Upgrade failed'
}

/**
 * The new recovery key has been written down and typed back: send what was
 * waiting for it. If another tab moved the account first (AUTH-063), this
 * one's recovery key was never stored — so it is not kept, and the account is
 * read again. A renewal refused because the account moved under it (AUTH-065)
 * is dropped too, to be started again from Profile.
 */
export async function confirmKeyChange(): Promise<string | null> {
  if (!pendingKeyChange) return null
  const problem = await pendingKeyChange.commit()
  if (problem && !problem.includes('AUTH-063') && !problem.includes('AUTH-065')) return problem
  pendingKeyChange = null
  if (problem?.includes('AUTH-063')) await checkAuth()
  return problem?.includes('AUTH-065') ? problem : null
}

/**
 * Renew every key: a new password, a new vault key with everything sealed
 * under it again, and a new recovery key. For whoever does not trust what a
 * server might have kept from before the move to separate keys. Prepared now;
 * sent once the new recovery key has been typed back (confirmKeyChange).
 */
export async function renewKeys(currentPassword: string, newPassword: string): Promise<string | null> {
  if (!currentUser) return 'Not logged in'
  const problem = passwordChangeProblem(currentPassword, newPassword)
  if (problem) return problem
  if (currentPassword === newPassword) {
    return withCode({ error: 'the new password must differ from the current one', code: 'AUTH-066' })
  }
  if (versionOf(currentUser) < 2) return withCode({ error: 'upgrade before renewing', code: 'AUTH-064' })

  let iterations: number
  try {
    iterations = (await prelogin(currentUser.email)).iterations
  } catch (e) {
    return e instanceof Error ? e.message : 'Renewal failed'
  }
  const current = await derivePasswordKeys(currentPassword, currentUser.email, iterations)
  if (!(await opensVault(current, 2))) return withCode({ error: 'incorrect password', code: 'AUTH-015' })
  const next = await derivePasswordKeys(newPassword, currentUser.email, iterations)

  let prepared: Awaited<ReturnType<typeof prepareRenewal>>
  try {
    prepared = await prepareRenewal(next)
  } catch (e) {
    return e instanceof Error ? e.message : 'Renewal failed'
  }

  pendingKeyChange = {
    kind: 'renewal',
    recoveryKey: prepared.recoveryKey,
    commit: async () => {
      const res = await fetch(`${API_BASE}/auth/renew-keys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ auth_key: current.authKey, ...prepared.body }),
      })
      const data = await res.json().catch(() => ({ error: 'Renewal failed' }))
      if (!res.ok) return withCode(data) || 'Renewal failed'
      await renewalStored(prepared, data.vault_updated_at ?? null)
      keysRenewed = true
      return null
    },
  }
  return null
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

    const keys = heldKeys
    const password = heldPassword
    const email = heldEmail
    heldKeys = null
    heldPassword = null
    heldEmail = null
    if (keys && email) await afterSignIn(keys, password, email)
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

  let iterations: number
  try {
    iterations = (await prelogin(currentUser.email)).iterations
  } catch (e) {
    return e instanceof Error ? e.message : 'Unlock failed'
  }
  const keys = await derivePasswordKeys(password, currentUser.email, iterations)
  const version = versionOf(currentUser)
  const vaultResult = await initializeVault(keys, currentUser.id, version)
  if (vaultResult === 'ok') {
    vaultLocked = false
    // The one moment a still-open version 1 session has the password.
    await offerUpgrade(keys, password)
    return null
  } else if (vaultResult === 'no-keys') {
    // Keys don't exist yet — need setup
    heldKeys = keys
    heldEmail = currentUser.email
    vaultNeedsSetup = true
    vaultLocked = false
    return null
  } else {
    // decrypt-failed — need recovery
    heldKeys = keys
    heldPassword = version < 2 ? password : null
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
  if (!heldKeys || !currentUser) return null

  const recoveryKey = await setupKeys(heldKeys, currentUser.id)
  heldKeys = null
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
    heldKeys = null
    heldPassword = null
    heldEmail = null
    pendingKeyChange = null
    keysRenewed = false
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

  if (!currentUser) return 'Not logged in'

  // Both passwords become keys here; neither is sent. The current one as the
  // account's own proof, the new one always as an auth key, which makes a
  // version 1 account version 2.
  let iterations: number
  try {
    iterations = (await prelogin(currentUser.email)).iterations
  } catch (e) {
    return e instanceof Error ? e.message : 'Password change failed'
  }
  const newKeys = await derivePasswordKeys(newPassword, currentUser.email, iterations)
  const current = versionOf(currentUser) < 2
    ? { current_password: currentPassword }
    : { current_auth_key: (await derivePasswordKeys(currentPassword, currentUser.email, iterations)).authKey }

  if (currentUser.role !== 'admin') {
    const mustChangeWithLockedVault = currentUser.must_change_password && vaultDecryptFailed
    if (!mustChangeWithLockedVault && !vaultNeedsSetup) {
      try {
        await reEncryptMEK(newKeys)
      } catch (e) {
        return e instanceof Error ? e.message : 'Failed to re-encrypt vault keys'
      }
    }
  }

  const res = await fetch(`${API_BASE}/auth/change-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ ...current, new_auth_key: newKeys.authKey }),
  })

  if (res.ok) {
    // Signed out, as by logout, and with the same state cleared: the old
    // password must not stay held for a vault setup, nor the flags outlive
    // the session they described.
    currentUser = null
    heldKeys = null
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
  if (!heldKeys) return 'Password not available for re-encryption'

  try {
    await recoverVault(recoveryKey, heldKeys, versionOf(currentUser), currentUser.id)
    const keys = heldKeys
    const password = heldPassword
    heldKeys = null
    heldPassword = null
    heldEmail = null
    vaultDecryptFailed = false
    // A recovery key the server once received is replaced now, while the
    // vault is open: shown, typed back, then stored.
    await offerUpgrade(keys, password)
  } catch (e) {
    return e instanceof Error ? e.message : 'Recovery failed'
  }

  return null
}

export async function inviteUser(email: string, role: 'admin' | 'user' = 'user', password?: string): Promise<{ user?: User; error?: string }> {
  const body: Record<string, string> = { email, role }
  // A first password, without email: sent as the invitee's auth key, derived
  // here for their address, so the server never sees it.
  const problem = password ? passwordProblem(password) : null
  if (problem) return { error: problem }
  if (password) body.auth_key = (await derivePasswordKeys(password, email, DEFAULT_ITERATIONS)).authKey

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
  const problem = passwordProblem(password)
  if (problem) return problem
  const keys = await derivePasswordKeys(password, email, DEFAULT_ITERATIONS)
  const res = await fetch(`${API_BASE}/auth/setup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ email, auth_key: keys.authKey }),
  })

  if (res.ok) {
    currentUser = await res.json()
    needsSetup = false

    // Admin (first account) skips vault — no encryption keys needed
    if (currentUser && currentUser.role !== 'admin') {
      // Set up vault keys for the new user
      try {
        const recoveryKey = await setupKeys(keys, currentUser.id)
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
  const problem = passwordProblem(password)
  if (problem) return problem
  // The keys are derived from the invitee's address, which the link does not
  // carry: asked for first, by token.
  const who = await fetch(`${API_BASE}/auth/invitation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ token }),
  })
  if (!who.ok) {
    const data = await who.json().catch(() => ({ error: 'Verification failed' }))
    return withCode(data) || 'Verification failed'
  }
  const { email, iterations } = await who.json()
  const keys = await derivePasswordKeys(password, email, iterations ?? DEFAULT_ITERATIONS)

  const res = await fetch(`${API_BASE}/auth/verify-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ token, auth_key: keys.authKey }),
  })

  if (res.ok) {
    currentUser = await res.json()

    // Set up vault keys for the invited user (admin users skip vault)
    if (currentUser && currentUser.role !== 'admin') {
      try {
        const recoveryKey = await setupKeys(keys, currentUser.id)
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
  let proof: { password: string } | { auth_key: string }
  try {
    proof = await proofFor(password)
  } catch (e) {
    return e instanceof Error ? e.message : 'Failed'
  }
  const res = await fetch(`${API_BASE}/auth/2fa`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(proof),
  })

  if (res.ok) return null

  const data = await res.json().catch(() => ({ error: 'Failed to disable 2FA' }))
  return withCode(data) || 'Failed to disable 2FA'
}

export async function regenerateRecoveryCodes(password: string): Promise<{ recovery_codes: string[] } | { error: string }> {
  let proof: { password: string } | { auth_key: string }
  try {
    proof = await proofFor(password)
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed' }
  }
  const res = await fetch(`${API_BASE}/auth/2fa/recovery-codes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(proof),
  })

  if (res.ok) {
    return res.json()
  }

  const data = await res.json().catch(() => ({ error: 'Failed to regenerate codes' }))
  return { error: withCode(data) || 'Failed to regenerate codes' }
}

export async function deleteAccount(password: string): Promise<string | null> {
  let proof: { password: string } | { auth_key: string }
  try {
    proof = await proofFor(password)
  } catch (e) {
    return e instanceof Error ? e.message : 'Failed'
  }
  const res = await fetch(`${API_BASE}/auth/account`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(proof),
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

export async function adminResetPassword(id: number): Promise<{ temp_password: string; temp_expires_at: string } | { error: string }> {
  const res = await fetch(`${API_BASE}/auth/users/${id}/reset-password`, {
    method: 'POST',
    credentials: 'include',
  })

  const data = await res.json().catch(() => ({ error: 'Failed to reset password' }))
  if (res.ok) return { temp_password: data.temp_password, temp_expires_at: data.temp_expires_at }
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

export interface Lockout {
  kind: string
  key: string
  attempts: number
  until: string
  email?: string
}

export async function listLockouts(): Promise<{ lockouts: Lockout[] } | { error: string }> {
  const res = await fetch(`${API_BASE}/auth/lockouts`, { credentials: 'include' })
  const data = await res.json().catch(() => ({ error: 'Failed to load lockouts' }))
  if (res.ok) return { lockouts: data.lockouts ?? [] }
  return { error: withCode(data) || 'Failed to load lockouts' }
}

export async function clearLockouts(request: { kind: string; key: string } | { all: true }): Promise<string | null> {
  const res = await fetch(`${API_BASE}/auth/lockouts/clear`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(request),
  })
  if (res.ok) return null
  const data = await res.json().catch(() => ({ error: 'Failed to clear lockouts' }))
  return withCode(data) || 'Failed to clear lockouts'
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
