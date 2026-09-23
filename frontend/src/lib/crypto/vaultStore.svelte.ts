import { deriveKEK, generateMEK, wrapMEK, unwrapMEK, generateRecoveryKey, wrapMEKWithRecovery, unwrapMEKWithRecovery } from './keys'
import { encryptVault, decryptVault, createEmptyVault, assertVaultShape, VaultVersionAheadError, type VaultData } from './vault'
import {
  fetchVaultKeys, setupVaultKeys, updateVaultKeys, fetchVault, putVault, recoverVaultKeys, VaultConflictError,
  fetchHouseholds, createHousehold as postHousehold, fetchHouseholdVault, putHouseholdVault,
  renameHousehold as putHouseholdName, deleteHousehold as removeHousehold,
} from '../api/client'
import { generateIdentity, sealIdentity, openIdentity, isComplete, type OpenIdentity } from './identity'
import { generateHouseholdKey, sealKeyForSelf, sealName, openListedHousehold, type OpenHousehold } from './household'

/**
 * Which vault the screens are looking at.
 *
 * `'personal'` is the one everybody has and nobody can leave. A number is a
 * household's id.
 */
export type VaultId = 'personal' | number

/**
 * Everything that belongs to *a vault* rather than to the session.
 *
 * One object rather than a dozen loose variables, because switching context
 * means putting one of these aside and picking another up — and a field-by-field
 * stash is a field somebody eventually forgets, which would show one household's
 * unsaved-changes warning over another household's budget.
 */
interface VaultSlot {
  data: VaultData | null
  /** The MEK for the personal vault; the household key for a household. */
  key: CryptoKey | null
  /**
   * The updated_at last seen from the server. Sent back on save so a stale write
   * is refused rather than silently replacing a newer vault. Null means "nothing
   * on the server yet", which is the only case that may write unconditionally.
   */
  lastUpdatedAt: string | null
  dirty: boolean
  saving: boolean
  lastSaved: Date | null
  /**
   * Set when the server refuses a save because the vault moved on. Sticky: the
   * in-memory vault is now known to be stale, and every further save would fail
   * the same way, so the UI must tell the user to reload rather than retry.
   */
  conflicted: boolean
  /**
   * Set when the in-memory vault does not match the version it declares. Sticky
   * for the same reason as `conflicted`: every further save would be the same bad
   * write, and writing it is worse than not saving at all.
   */
  shapeInvalid: boolean
  /**
   * Set when the stored vault was written by a newer build. Distinct from a
   * decryption failure: the key is fine and the data is fine, this build simply
   * cannot read the shape. Nothing may be saved while it is set.
   */
  versionAhead: boolean
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
  parked: VaultData | null
}

function emptySlot(): VaultSlot {
  return {
    data: null,
    key: null,
    lastUpdatedAt: null,
    dirty: false,
    saving: false,
    lastSaved: null,
    conflicted: false,
    shapeInvalid: false,
    versionAhead: false,
    parked: null,
  }
}

/** The vault on screen. Reassigned wholesale when the context switches. */
let current = $state<VaultSlot>(emptySlot())
let currentId = $state<VaultId>('personal')

/**
 * The slots not on screen.
 *
 * A plain Map rather than `$state`: nothing renders from it. A slot only ever
 * becomes visible by being assigned to `current`, and that assignment is what
 * the screens react to.
 */
const stashed = new Map<VaultId, VaultSlot>()

// --- session-wide, and therefore not in a slot ---

/**
 * The personal MEK.
 *
 * Also the personal slot's `key`, but kept here as well because it does a second
 * job no household key can do: every household key is sealed under it, so
 * opening one needs it whatever vault happens to be on screen.
 */
let mek = $state<CryptoKey | null>(null)

/**
 * The user's own keypairs, once unsealed.
 *
 * Null for anyone whose vault predates identities, and null before unlock —
 * both private halves are sealed under the MEK, so there is nothing to hold
 * until the MEK is in hand.
 */
let identity = $state<OpenIdentity | null>(null)

let unlocked = $state(false)

/**
 * Every household the user belongs to, with its name already readable.
 *
 * Loaded at unlock because the switch has to list them; their *payloads* are
 * not, and are fetched on first switch. That is the whole reason a household's
 * name is its own small ciphertext rather than something inside the payload.
 */
let households = $state<OpenHousehold[]>([])

let saveTimer: ReturnType<typeof setTimeout> | null = null

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
    get vault() { return current.data },
    set vault(v: VaultData | null) { current.data = v },
    get mek() { return mek },
    get dirty() { return current.dirty },
    /** True once the server refused a save because the vault changed elsewhere. */
    get conflicted() { return current.conflicted },
    /** True when the stored vault is newer than this build can read. */
    get versionAhead() { return current.versionAhead },
    /** True when the vault in memory contradicts its own version, so saving is refused. */
    get shapeInvalid() { return current.shapeInvalid },
    get saving() { return current.saving },
    get lastSaved() { return current.lastSaved },
    get unlocked() { return unlocked },
    /** True while the screens are showing a throwaway copy. See `parked`. */
    get previewing() { return current.parked !== null },
    /**
     * The user's own keypairs, or null if they have none — which is every vault
     * created before identities existed. A household cannot be shared without
     * one.
     */
    get identity() { return identity },
    /** Which vault the screens are showing. */
    get currentVaultId() { return currentId },
    /** Every household the user belongs to, names already readable. */
    get households() { return households },
    /** The household on screen, or null when the personal vault is. */
    get currentHousehold() {
      return currentId === 'personal' ? null : households.find(h => h.id === currentId) ?? null
    },
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
  if (!current.data || current.parked) return false

  if (current.dirty) void saveVault()

  current.parked = current.data
  // `$state.snapshot` rather than the proxy itself: the copy must be plain and
  // deep, or editing it would reach through into the user's own vault.
  const copy = $state.snapshot(current.data) as VaultData
  fill(copy)
  current.data = copy
  return true
}

/** Puts the real vault back. Safe to call when no preview is running. */
export function endPreview(): void {
  if (!current.parked) return
  current.data = current.parked
  current.parked = null
}

// --- switching between vaults ---

/**
 * Put the vault on screen aside and bring another forward.
 *
 * Flushes *before* stashing: a slot put away while still dirty, with a live
 * timer, would try to save itself once a different vault was on screen — and
 * `saveVault` writes whatever `current` holds.
 *
 * A household's payload is fetched the first time it is switched to rather than
 * at unlock, because there is no reason to pull a blob nobody has opened.
 */
export async function switchTo(id: VaultId): Promise<void> {
  if (id === currentId) return
  if (id !== 'personal' && !households.some(h => h.id === id)) return

  await putCurrentAside()
  currentId = id

  const waiting = stashed.get(id)
  if (waiting) {
    current = waiting
    stashed.delete(id)
    return
  }

  current = emptySlot()
  // Reaching here for the personal vault would mean it was never loaded, which
  // unlock does; there is nothing to fetch.
  if (id === 'personal') return

  const household = households.find(h => h.id === id)
  if (!household) return
  current.key = household.key

  try {
    const payload = await fetchHouseholdVault(id)
    if (!payload) {
      // Gone, or never ours — the server answers the same either way, and so
      // does this. Dropped from the list rather than left as a name that opens
      // nothing.
      households = households.filter(h => h.id !== id)
      await switchTo('personal')
      return
    }
    current.data = await decryptVault(payload.ciphertext, payload.nonce, household.key)
    current.lastUpdatedAt = payload.updated_at
  } catch (e) {
    if (e instanceof VaultVersionAheadError) {
      current.versionAhead = true
      return
    }
    throw e
  }
}

/**
 * Read the list of households and open their names.
 *
 * Names only. Every payload stays on the server until somebody switches to it.
 */
async function loadHouseholds(withMEK: CryptoKey): Promise<void> {
  try {
    const listed = await fetchHouseholds()
    const opened = await Promise.all(listed.map(l => openListedHousehold(l, withMEK).catch(() => null)))
    // A household whose key will not open is dropped rather than shown as a
    // name leading nowhere. `openListedHousehold` also returns null for a wrap
    // kind this build cannot yet verify.
    households = opened.filter((h): h is OpenHousehold => h !== null)
  } catch {
    // Not fatal. Someone whose households could not be listed still has their
    // own vault, and refusing to unlock over it would be the wrong trade.
    households = []
  }
}

/**
 * Flush whatever is on screen and put it in the stash.
 *
 * The flush comes first on purpose: a slot put away while still dirty, with a
 * live timer, would try to save itself once a different vault was on screen —
 * and `saveVault` writes whatever `current` holds.
 */
async function putCurrentAside(): Promise<void> {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  if (current.dirty) await saveVault()
  stashed.set(currentId, current)
}

/** Make a household, with its own key, and switch to it. */
export async function createHousehold(name: string): Promise<number> {
  if (!mek) throw new Error('Vault not unlocked')

  const key = await generateHouseholdKey()
  const empty = createEmptyVault()
  const payload = await encryptVault(empty, key)

  const created = await postHousehold({
    encrypted_name: await sealName(name, key),
    // Sealed under the creator's own MEK rather than wrapped to their own
    // public key. See `sealKeyForSelf` for why that distinction matters.
    wrapped_key: await sealKeyForSelf(key, mek),
    ciphertext: payload.ciphertext,
    nonce: payload.nonce,
    version: empty.version,
  })

  households = [{ id: created.id, name, key, isOwner: true, updatedAt: created.updated_at }, ...households]

  // Installed directly rather than through `switchTo`, which would fetch the
  // payload back from the server — a round trip to be told the thing we just
  // encrypted and sent. It would also make creating a household depend on that
  // fetch succeeding, and a `null` answer drops a household from the list.
  await putCurrentAside()
  currentId = created.id
  current = { ...emptySlot(), data: empty, key, lastUpdatedAt: created.updated_at }

  return created.id
}

/** Rename a household. Its name is a ciphertext, so this re-seals it. */
export async function renameHousehold(id: number, name: string): Promise<void> {
  const household = households.find(h => h.id === id)
  if (!household) return

  await putHouseholdName(id, await sealName(name, household.key))
  households = households.map(h => (h.id === id ? { ...h, name } : h))
}

/** Delete a household. Owner only, which the server enforces. */
export async function deleteHousehold(id: number): Promise<void> {
  await removeHousehold(id)
  households = households.filter(h => h.id !== id)
  stashed.delete(id)

  if (currentId === id) {
    currentId = 'personal'
    current = stashed.get('personal') ?? emptySlot()
    stashed.delete('personal')
  }
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
      current.data = await decryptVault(vaultData.ciphertext, vaultData.nonce, cachedMEK)
      current.lastUpdatedAt = vaultData.updated_at
    } else {
      current.data = createEmptyVault()
      current.lastUpdatedAt = null
    }
    mek = cachedMEK
    current.key = cachedMEK
    // A restored session has to be as capable as a freshly unlocked one. If
    // this were left out, reloading the page would silently take away the
    // ability to share a household until the next real sign-in.
    const keys = await fetchVaultKeys()
    identity = isComplete(keys) ? await openIdentity(keys, cachedMEK) : null
    await loadHouseholds(cachedMEK)
    unlocked = true
    return true
  } catch (e) {
    if (e instanceof VaultVersionAheadError) {
      // The cached key is not the problem, so it stays: clearing it would make
      // the user sign in again to reach the same wall.
      current.versionAhead = true
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
    current.key = mek
    identity = isComplete(keys) ? await openIdentity(keys, mek) : null

    const vaultData = await fetchVault()
    if (vaultData) {
      current.data = await decryptVault(vaultData.ciphertext, vaultData.nonce, mek)
      current.lastUpdatedAt = vaultData.updated_at
    } else {
      current.data = createEmptyVault()
      await saveVault()
    }

    await loadHouseholds(mek)
    await cacheMEK(mek)
    unlocked = true
    return 'ok'
  } catch (e) {
    mek = null
    current = emptySlot()
    unlocked = false
    if (e instanceof VaultVersionAheadError) {
      current.versionAhead = true
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

  // Generated for everyone, sharing or not. A keypair that only appears when
  // somebody first wants to share is a keypair that is missing at the moment an
  // invitation arrives — and generating one then would need the password again,
  // which by then has been typed and forgotten.
  const freshIdentity = await generateIdentity()
  const sealed = await sealIdentity(freshIdentity, newMEK)

  await setupVaultKeys({
    encrypted_mek: encryptedMEK,
    recovery_key_hash: recoveryKeyHash,
    encrypted_mek_recovery: encryptedMEKRecovery,
    ...sealed,
  })

  identity = await openIdentity(sealed, newMEK)
  mek = newMEK
  current.key = newMEK
  current.data = createEmptyVault()
  await saveVault()
  await cacheMEK(newMEK)
  unlocked = true

  return recoveryKey
}

/**
 * Save the current vault (encrypt + PUT to server).
 */
export async function saveVault(): Promise<void> {
  // Captured before the first await: the user may switch vaults while the
  // request is in flight, and both the answer and the flags belong to the vault
  // that sent it rather than to whichever one is on screen when it returns.
  const slot = current
  const id = currentId

  if (!slot.data || !slot.key) return
  // The vault on screen is a throwaway copy, not the user's. Refused here
  // rather than at each call site because this is where they all arrive.
  if (slot.parked) return
  // Once the server has told us we are stale, retrying can only fail again — and
  // the auto-save runs every couple of seconds, so retrying would hammer it.
  if (slot.conflicted || slot.shapeInvalid) return

  // Checked before the write, not after the read: a vault that cannot describe
  // itself must not be allowed over one that can. `dirty` stays set, so the UI
  // keeps saying the edits are unsaved rather than implying they landed.
  try {
    assertVaultShape(slot.data)
  } catch {
    slot.shapeInvalid = true
    return
  }

  slot.saving = true
  try {
    const { ciphertext, nonce } = await encryptVault(slot.data, slot.key)
    const body = {
      ciphertext,
      nonce,
      version: slot.data.version,
      // Omitted when there is no server copy yet: the first save has nothing to
      // conflict with, and sending a token we never received would be a lie.
      ...(slot.lastUpdatedAt === null ? {} : { expected_updated_at: slot.lastUpdatedAt }),
    }

    const result = id === 'personal' ? await putVault(body) : await putHouseholdVault(id, body)
    slot.lastUpdatedAt = result.updated_at
    slot.dirty = false
    slot.lastSaved = new Date()
  } catch (e) {
    if (e instanceof VaultConflictError) {
      // Leave `dirty` set: the edits are still unsaved, and the user needs to
      // know they will be lost on reload rather than believing they persisted.
      slot.conflicted = true
      return
    }
    throw e
  } finally {
    slot.saving = false
  }
}

/**
 * Mark vault as dirty — triggers debounced auto-save (2s).
 */
export function markDirty(): void {
  // Nothing in a preview is worth saving, and setting the flag would put an
  // "unsaved" warning on the screen about edits that do not exist.
  if (current.parked) return
  current.dirty = true
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
  if (current.dirty && current.data && current.key) {
    saveVault()
  }
  current = emptySlot()
  currentId = 'personal'
  // Every vault, not only the one on screen. A stashed slot holds a household's
  // decrypted budget and its key, and letting that outlive a sign-out would be
  // the same mistake as leaving the MEK behind.
  stashed.clear()
  households = []
  mek = null
  // With the MEK, and for the same reason: two unsealed private keys are worth
  // no less than the vault they can open.
  identity = null
  unlocked = false
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

  // The identity is sealed under the MEK rather than under the password, so a
  // password reset leaves it untouched — and the user keeps the keypairs their
  // households already wrapped keys to. The households come back for the same
  // reason: their keys are sealed under this MEK, which has not changed.
  mek = recoveredMEK
  current.key = recoveredMEK
  identity = isComplete(result) ? await openIdentity(result, recoveredMEK) : null

  const vaultData = await fetchVault()
  if (vaultData) {
    current.data = await decryptVault(vaultData.ciphertext, vaultData.nonce, recoveredMEK)
    current.lastUpdatedAt = vaultData.updated_at
  } else {
    current.data = createEmptyVault()
    await saveVault()
  }

  await loadHouseholds(recoveredMEK)
  await cacheMEK(recoveredMEK)
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
    if (current.dirty && current.data && current.key) {
      // Try to save synchronously via sendBeacon is not great for this.
      // The navigator.sendBeacon approach is limited. Instead, show a warning.
      e.preventDefault()
    }
  })
}
