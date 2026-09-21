import { deriveKEK, generateMEK, wrapMEK, unwrapMEK, generateRecoveryKey, wrapMEKWithRecovery, unwrapMEKWithRecovery } from './keys'
import { encryptVault, decryptVault, createEmptyVault, assertVaultShape, VaultVersionAheadError, type VaultData } from './vault'
import { fetchVaultKeys, setupVaultKeys, updateVaultKeys, fetchVault, putVault, recoverVaultKeys, VaultConflictError } from '../api/client'

let vault = $state<VaultData | null>(null)
let mek = $state<CryptoKey | null>(null)
let dirty = $state(false)
let saving = $state(false)
let lastSaved = $state<Date | null>(null)
let unlocked = $state(false)

// The updated_at last seen from the server. Sent back on save so a stale write
// is refused rather than silently replacing a newer vault. Null means "nothing
// on the server yet", which is the only case that may write unconditionally.
let lastUpdatedAt = $state<string | null>(null)

// Set when the server refuses a save because the vault moved on. Sticky: the
// in-memory vault is now known to be stale, and every further save would fail
// the same way, so the UI must tell the user to reload rather than retry.
let conflicted = $state(false)

// Set when the in-memory vault does not match the version it declares. Sticky
// for the same reason as `conflicted`: every further save would be the same bad
// write, and writing it is worse than not saving at all.
let shapeInvalid = $state(false)

// Set when the stored vault was written by a newer build. Distinct from a
// decryption failure: the key is fine and the data is fine, this build simply
// cannot read the shape. Nothing may be saved while it is set.
let versionAhead = $state(false)

let saveTimer: ReturnType<typeof setTimeout> | null = null

/**
 * The real vault, parked while a throwaway copy is on screen.
 *
 * The guided tour wants to *show* an example budget without the user ending
 * up with one. Seeding for real and undoing afterwards cannot be made safe —
 * an interrupted tour leaves the data behind, and the autosave would have
 * persisted it seconds earlier — so nothing is written at all: the store
 * hands the screens a copy, and puts the original back when the tour ends.
 *
 * Non-null is the whole flag. While it is set the vault on screen is not the
 * user's, and `saveVault` refuses on that basis — which is the one guard that
 * matters, because every write in the app funnels through it: the debounced
 * autosave, the flush on logout, and any direct call alike.
 */
let parked: VaultData | null = null

const MEK_STORAGE_KEY = 'vault_mek'

/** Export MEK to sessionStorage so it survives page refreshes. */
async function cacheMEK(key: CryptoKey): Promise<void> {
  const raw = await crypto.subtle.exportKey('raw', key)
  sessionStorage.setItem(MEK_STORAGE_KEY, btoa(String.fromCharCode(...new Uint8Array(raw))))
}

/** Restore MEK from sessionStorage. Returns null if not cached. */
async function restoreMEK(): Promise<CryptoKey | null> {
  const stored = sessionStorage.getItem(MEK_STORAGE_KEY)
  if (!stored) return null
  const raw = Uint8Array.from(atob(stored), c => c.charCodeAt(0))
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, true, ['encrypt', 'decrypt'])
}

function clearCachedMEK(): void {
  sessionStorage.removeItem(MEK_STORAGE_KEY)
}

export function getVaultState() {
  return {
    get vault() { return vault },
    set vault(v: VaultData | null) { vault = v },
    get mek() { return mek },
    get dirty() { return dirty },
    /** True once the server refused a save because the vault changed elsewhere. */
    get conflicted() { return conflicted },
    /** True when the stored vault is newer than this build can read. */
    get versionAhead() { return versionAhead },
    /** True when the vault in memory contradicts its own version, so saving is refused. */
    get shapeInvalid() { return shapeInvalid },
    get saving() { return saving },
    get lastSaved() { return lastSaved },
    get unlocked() { return unlocked },
    /** True while the screens are showing a throwaway copy. See `parked`. */
    get previewing() { return parked !== null },
  }
}

/**
 * Shows a throwaway copy of the vault, built by `fill`, until `endPreview`.
 *
 * Any pending edit is flushed first, so nothing real is left unsaved behind
 * the copy. Returns false if there is nothing to copy or a preview is already
 * running, so a caller cannot nest one and lose the original.
 */
export function beginPreview(fill: (copy: VaultData) => void): boolean {
  if (!vault || parked) return false

  if (dirty) void saveVault()

  parked = vault
  // `$state.snapshot` rather than the proxy itself: the copy must be plain and
  // deep, or editing it would reach through into the user's own vault.
  const copy = $state.snapshot(vault) as VaultData
  fill(copy)
  vault = copy
  return true
}

/** Puts the real vault back. Safe to call when no preview is running. */
export function endPreview(): void {
  if (!parked) return
  vault = parked
  parked = null
}

/**
 * Try to restore vault from sessionStorage (page refresh).
 * Returns true if successful, false if no cached MEK.
 */
export async function tryRestoreVault(): Promise<boolean> {
  const cachedMEK = await restoreMEK()
  if (!cachedMEK) return false

  try {
    const vaultData = await fetchVault()
    if (vaultData) {
      vault = await decryptVault(vaultData.ciphertext, vaultData.nonce, cachedMEK)
      lastUpdatedAt = vaultData.updated_at
    } else {
      vault = createEmptyVault()
      lastUpdatedAt = null
    }
    mek = cachedMEK
    unlocked = true
    return true
  } catch (e) {
    if (e instanceof VaultVersionAheadError) {
      // The cached key is not the problem, so it stays: clearing it would make
      // the user sign in again to reach the same wall.
      versionAhead = true
      return false
    }
    clearCachedMEK()
    return false
  }
}

/**
 * Initialize vault after login: derive KEK, unwrap MEK, decrypt vault.
 * Returns 'ok' on success, 'no-keys' if keys don't exist yet,
 * or 'decrypt-failed' if keys exist but unwrap/decrypt failed.
 */
export async function initializeVault(password: string, email: string): Promise<'ok' | 'no-keys' | 'decrypt-failed' | 'version-ahead'> {
  const keys = await fetchVaultKeys()
  if (!keys) return 'no-keys'

  try {
    const kek = await deriveKEK(password, email, keys.iterations)
    mek = await unwrapMEK(keys.encrypted_mek, kek)

    const vaultData = await fetchVault()
    if (vaultData) {
      vault = await decryptVault(vaultData.ciphertext, vaultData.nonce, mek)
      lastUpdatedAt = vaultData.updated_at
    } else {
      vault = createEmptyVault()
      await saveVault()
    }

    await cacheMEK(mek)
    unlocked = true
    return 'ok'
  } catch (e) {
    mek = null
    vault = null
    unlocked = false
    if (e instanceof VaultVersionAheadError) {
      versionAhead = true
      return 'version-ahead'
    }
    return 'decrypt-failed'
  }
}

/**
 * Set up encryption keys for the first time.
 * Returns the recovery key that must be shown to the user.
 */
export async function setupKeys(password: string, email: string): Promise<string> {
  const newMEK = await generateMEK()
  const kek = await deriveKEK(password, email, 600000)
  const encryptedMEK = await wrapMEK(newMEK, kek)

  const recoveryKey = generateRecoveryKey()
  const encryptedMEKRecovery = await wrapMEKWithRecovery(newMEK, recoveryKey)

  // Hash the recovery key for server-side verification
  const recoveryKeyHash = await hashRecoveryKey(recoveryKey)

  await setupVaultKeys({
    encrypted_mek: encryptedMEK,
    recovery_key_hash: recoveryKeyHash,
    encrypted_mek_recovery: encryptedMEKRecovery,
  })

  mek = newMEK
  vault = createEmptyVault()
  await saveVault()
  await cacheMEK(mek)
  unlocked = true

  return recoveryKey
}

/**
 * Save the current vault (encrypt + PUT to server).
 */
export async function saveVault(): Promise<void> {
  if (!vault || !mek) return
  // The vault on screen is a throwaway copy, not the user's. Refused here
  // rather than at each call site because this is where they all arrive.
  if (parked) return
  // Once the server has told us we are stale, retrying can only fail again — and
  // the auto-save runs every couple of seconds, so retrying would hammer it.
  if (conflicted || shapeInvalid) return

  // Checked before the write, not after the read: a vault that cannot describe
  // itself must not be allowed over one that can. `dirty` stays set, so the UI
  // keeps saying the edits are unsaved rather than implying they landed.
  try {
    assertVaultShape(vault)
  } catch {
    shapeInvalid = true
    return
  }

  saving = true
  try {
    const { ciphertext, nonce } = await encryptVault(vault, mek)
    const result = await putVault({
      ciphertext,
      nonce,
      version: vault.version,
      // Omitted when there is no server copy yet: the first save has nothing to
      // conflict with, and sending a token we never received would be a lie.
      ...(lastUpdatedAt === null ? {} : { expected_updated_at: lastUpdatedAt }),
    })
    lastUpdatedAt = result.updated_at
    dirty = false
    lastSaved = new Date()
  } catch (e) {
    if (e instanceof VaultConflictError) {
      // Leave `dirty` set: the edits are still unsaved, and the user needs to
      // know they will be lost on reload rather than believing they persisted.
      conflicted = true
      return
    }
    throw e
  } finally {
    saving = false
  }
}

/**
 * Mark vault as dirty — triggers debounced auto-save (2s).
 */
export function markDirty(): void {
  // Nothing in a preview is worth saving, and setting the flag would put an
  // "unsaved" warning on the screen about edits that do not exist.
  if (parked) return
  dirty = true
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveVault()
  }, 2000)
}

/**
 * Clear all crypto state on logout.
 */
export function clearVault(): void {
  // Before the flush below: that flush must see the real vault, and must not
  // be refused for a preview nobody is looking at any more.
  endPreview()
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  // Save if dirty before clearing
  if (dirty && vault && mek) {
    saveVault()
  }
  vault = null
  mek = null
  dirty = false
  saving = false
  lastSaved = null
  unlocked = false
  lastUpdatedAt = null
  conflicted = false
  clearCachedMEK()
}

/**
 * Re-encrypt MEK after password change.
 */
export async function reEncryptMEK(oldPassword: string, newPassword: string, email: string): Promise<void> {
  if (!mek) throw new Error('Vault not unlocked')

  const newKEK = await deriveKEK(newPassword, email, 600000)
  const newEncryptedMEK = await wrapMEK(mek, newKEK)
  await updateVaultKeys(newEncryptedMEK)
}

/**
 * Recover vault using recovery key + set a new password.
 * 1. Server verifies the recovery key hash and returns recovery-wrapped MEK
 * 2. Unwrap MEK with recovery key
 * 3. Re-wrap MEK with new password-derived KEK
 * 4. Decrypt vault
 */
export async function recoverVault(
  recoveryKey: string,
  newPassword: string,
  email: string,
): Promise<void> {
  // Get recovery-wrapped MEK from server (server verifies recovery key)
  const result = await recoverVaultKeys(recoveryKey)
  if (!result) throw new Error('Invalid recovery key')

  // Unwrap MEK using recovery key
  const recoveredMEK = await unwrapMEKWithRecovery(result.encrypted_mek_recovery, recoveryKey)

  // Re-wrap MEK with new password
  const newKEK = await deriveKEK(newPassword, email, 600000)
  const newEncryptedMEK = await wrapMEK(recoveredMEK, newKEK)
  await updateVaultKeys(newEncryptedMEK)

  // Decrypt vault
  mek = recoveredMEK
  const vaultData = await fetchVault()
  if (vaultData) {
    vault = await decryptVault(vaultData.ciphertext, vaultData.nonce, mek)
  } else {
    vault = createEmptyVault()
    await saveVault()
  }

  await cacheMEK(mek)
  unlocked = true
}

/**
 * Send raw recovery key to server — the server bcrypt-hashes it on receipt.
 * bcrypt is not available in the browser Web Crypto API.
 */
async function hashRecoveryKey(recoveryKey: string): Promise<string> {
  return recoveryKey
}

// Save on beforeunload if dirty
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', (e) => {
    if (dirty && vault && mek) {
      // Try to save synchronously via sendBeacon is not great for this.
      // The navigator.sendBeacon approach is limited. Instead, show a warning.
      e.preventDefault()
    }
  })
}
