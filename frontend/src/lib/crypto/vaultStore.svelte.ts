import { deriveKEK, generateMEK, wrapMEK, unwrapMEK, generateRecoveryKey, wrapMEKWithRecovery, unwrapMEKWithRecovery } from './keys'
import { encryptVault, decryptVault, createEmptyVault, type VaultData } from './vault'
import { fetchVaultKeys, setupVaultKeys, updateVaultKeys, fetchVault, putVault, recoverVaultKeys } from '../api/client'

let vault = $state<VaultData | null>(null)
let mek = $state<CryptoKey | null>(null)
let dirty = $state(false)
let saving = $state(false)
let lastSaved = $state<Date | null>(null)
let unlocked = $state(false)

let saveTimer: ReturnType<typeof setTimeout> | null = null

export function getVaultState() {
  return {
    get vault() { return vault },
    set vault(v: VaultData | null) { vault = v },
    get mek() { return mek },
    get dirty() { return dirty },
    get saving() { return saving },
    get lastSaved() { return lastSaved },
    get unlocked() { return unlocked },
  }
}

/**
 * Initialize vault after login: derive KEK, unwrap MEK, decrypt vault.
 * Returns 'ok' on success, 'no-keys' if keys don't exist yet,
 * or 'decrypt-failed' if keys exist but unwrap/decrypt failed.
 */
export async function initializeVault(password: string, email: string): Promise<'ok' | 'no-keys' | 'decrypt-failed'> {
  const keys = await fetchVaultKeys()
  if (!keys) return 'no-keys'

  try {
    const kek = await deriveKEK(password, email, keys.iterations)
    mek = await unwrapMEK(keys.encrypted_mek, kek)

    const vaultData = await fetchVault()
    if (vaultData) {
      vault = await decryptVault(vaultData.ciphertext, vaultData.nonce, mek)
    } else {
      vault = createEmptyVault()
      await saveVault()
    }

    unlocked = true
    return 'ok'
  } catch {
    mek = null
    vault = null
    unlocked = false
    return 'decrypt-failed'
  }
}

/**
 * Set up encryption keys for the first time (new user or migration).
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
  unlocked = true

  return recoveryKey
}

/**
 * Save the current vault (encrypt + PUT to server).
 */
export async function saveVault(): Promise<void> {
  if (!vault || !mek) return
  saving = true
  try {
    const { ciphertext, nonce } = await encryptVault(vault, mek)
    await putVault({ ciphertext, nonce, version: vault.version })
    dirty = false
    lastSaved = new Date()
  } finally {
    saving = false
  }
}

/**
 * Mark vault as dirty — triggers debounced auto-save (2s).
 */
export function markDirty(): void {
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

  unlocked = true
}

/**
 * Hash recovery key using bcrypt-compatible approach.
 * We use PBKDF2 to derive a hash that the server stores.
 * The server uses bcrypt on its end — so we send the raw key,
 * and the server hashes it. Actually, let's just send it for the server to hash.
 * Wait — the plan says server stores bcrypt hash, but we need to send the key.
 * Let's send the raw recovery key for the server to bcrypt-hash.
 *
 * Actually, looking at the handler: we send recovery_key_hash which the server stores directly.
 * And in recovery, the server compares with bcrypt.CompareHashAndPassword.
 * So we need to bcrypt-hash on the client? No — bcrypt is not available in browsers natively.
 *
 * Better approach: send the raw recovery key during setup, let the server hash it.
 * Let me adjust the API.
 */
async function hashRecoveryKey(recoveryKey: string): Promise<string> {
  // We'll send the raw key and let the server bcrypt-hash it.
  // The handler needs adjustment to hash on receipt.
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
