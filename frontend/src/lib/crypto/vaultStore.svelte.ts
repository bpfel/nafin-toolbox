import { deriveKEK, generateMEK, wrapMEK, unwrapMEK, generateRecoveryKey, wrapMEKWithRecovery, unwrapMEKWithRecovery } from './keys'
import { encryptVault, decryptVault, createEmptyVault, assertVaultShape, VaultVersionAheadError, type VaultData } from './vault'
import {
  fetchVaultKeys, setupVaultKeys, updateVaultKeys, setupIdentity, fetchVault, putVault, recoverVaultKeys, VaultConflictError, VaultReadOnlyError,
  VaultGoneError, SessionEndedError, VaultSaveError, signalUnauthorized,
  fetchHouseholds, createHousehold as postHousehold, fetchHouseholdVault, putHouseholdVault,
  renameHousehold as putHouseholdName, deleteHousehold as removeHousehold,
  fetchHouseholdMembers, fetchHouseholdInvites, createHouseholdInvite, deleteHouseholdInvite,
  acceptHouseholdInvite, confirmHouseholdInvite, removeHouseholdMember, changeHouseholdRole,
  type HouseholdMember, type HouseholdInvite,
} from '../api/client'
import { generateIdentity, sealIdentity, openIdentity, isComplete, type OpenIdentity } from './identity'
import {
  generateHouseholdKey, sealKeyForSelf, sealName, openName, openListedHousehold, openGrantedKey,
  HOUSEHOLD_NAME_MAX,
  type OpenHousehold,
} from './household'
import {
  sealGrant, macPublicKey, verifyPublicKeyMAC, generateInviteSecret, generateInviteToken,
  hashInviteToken,
} from './grant'
import { fromBase64, toBase64, importPublicKey, openUnder, sealUnder } from './identity'
import { seedNamesFor } from '../budget/seedNames'
import { getLocale } from '../i18n/index.svelte'
import { perform, overwriteBy, type Action, type ActionArgs, type ActionKind, type ActionResult } from '../sync/actions'
import { enqueue, replayAll } from '../sync/queue'
import { notify, clearNotices } from '../sync/notices.svelte'

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
   * Set when the server holds a newer vault that this client cannot open — a
   * household whose key was changed and whose new key did not arrive. Sticky:
   * saving over a vault it cannot read would destroy it, so the UI tells the
   * user to reload. An ordinary refusal no longer gets here; the queue is
   * replayed onto the newer vault instead.
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
  /**
   * Why changes are waiting longer than a save takes: the server could not be
   * reached, or kept refusing because others were saving at the same moment.
   * Null while saving works. Either way the changes are kept and tried again.
   */
  waiting: 'offline' | 'busy' | null
  /** How many changes have not reached the server. Shown when they are at risk. */
  pending: number
  /** A save was asked for while one was in flight; run it when that one ends. */
  again: boolean
  /** Consecutive failed attempts, for spacing out the retries. */
  failures: number
  /**
   * The status of a save the server refused for a reason retrying cannot fix.
   * Sticky, like `conflicted`: the banner asks for a reload.
   */
  refused: number | null
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
    waiting: null,
    pending: 0,
    again: false,
    failures: 0,
    refused: null,
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

/**
 * Each vault's changes that the server has not confirmed yet, oldest first.
 *
 * By vault id rather than in the slot: the slot is deep `$state`, and actions
 * must stay plain objects — they are cloned when a save is refused and applied
 * again, and a reactive proxy cannot be cloned. Nothing renders from them.
 */
const queues = new Map<VaultId, Action[]>()

/**
 * Each vault as the server last confirmed it, plain.
 *
 * What a replay compares against, to tell a value somebody else just changed
 * (it moved between this and the newer vault) from one nobody touched. Outside
 * the slot for the same reason as the queue.
 */
const bases = new Map<VaultId, VaultData>()

function setQueue(slot: VaultSlot, id: VaultId, queue: Action[]): void {
  queues.set(id, queue)
  slot.pending = queue.length
  slot.dirty = queue.length > 0
}

/** Note what the server holds, as of a load or a save. */
function confirmed(id: VaultId, data: VaultData): void {
  // A snapshot rather than structuredClone: `data` may already be reactive,
  // and a proxy cannot be cloned.
  bases.set(id, $state.snapshot(data) as VaultData)
}

const MEK_STORAGE_KEY = 'vault_mek'

/**
 * Which vault was on screen, remembered across a reload.
 *
 * Beside the MEK rather than in the vault, because it has the MEK's lifetime
 * exactly: this tab, this session, gone at sign-out. It is also not a fact
 * about the person — two tabs may reasonably sit on two different households —
 * so putting it in the vault would have made one tab's choice overwrite the
 * other's.
 *
 * Without it, every refresh dropped the user back on their personal budget and
 * they had to find their household again. That is a small annoyance once and an
 * infuriating one daily.
 */
const CURRENT_VAULT_KEY = 'vault_current'

/**
 * Which vault this user last had on screen in this browser, by user id.
 *
 * What a new tab or a fresh sign-in opens on, where `CURRENT_VAULT_KEY` has
 * nothing to say. Somebody who budgets in their household opens the app to
 * their household, without a setting to find first.
 *
 * In localStorage, and so per device, rather than in the personal vault: every
 * switch would otherwise be a write to the vault, and two devices switching
 * would refuse each other's saves for the sake of remembering one number. It
 * outlives sign-out on purpose — that is the moment it is for — and is keyed by
 * user so the next person on the same browser does not inherit it. It holds a
 * household's id and nothing that names it.
 */
const LAST_VAULT_KEY = 'vault_last'

/** Whose vault is open, for `LAST_VAULT_KEY`. Null when none is. */
let owner: number | null = null

function rememberCurrent(id: VaultId): void {
  try {
    sessionStorage.setItem(CURRENT_VAULT_KEY, String(id))
  } catch {
    // Private mode, blocked storage, a quota. Remembering is a convenience and
    // failing to remember is not worth a broken switch.
  }
  if (owner === null) return
  try {
    localStorage.setItem(`${LAST_VAULT_KEY}:${owner}`, String(id))
  } catch { /* as above */ }
}

/**
 * Where to land: what this tab had on screen before a reload, else what this
 * user last opened in this browser, if it is still somewhere they can go.
 */
function recallCurrent(): VaultId {
  let stored: string | null = null
  try {
    stored = sessionStorage.getItem(CURRENT_VAULT_KEY)
  } catch { /* see rememberCurrent */ }
  if (stored === null && owner !== null) {
    try {
      stored = localStorage.getItem(`${LAST_VAULT_KEY}:${owner}`)
    } catch { /* see rememberCurrent */ }
  }
  if (!stored || stored === 'personal') return 'personal'

  const id = Number(stored)
  // A household that has since been left, deleted, or whose grant no longer
  // opens is not somewhere to land. Personal is always there.
  return Number.isInteger(id) && households.some(h => h.id === id) ? id : 'personal'
}

/**
 * Opens what `recallCurrent` names, and pins it to this tab.
 *
 * Pinned even when nothing moved. Landing on the personal budget is no switch,
 * so this tab would otherwise have nothing of its own in sessionStorage, and its
 * next reload would follow whatever another tab had opened in the meantime.
 */
async function landOnRecalled(): Promise<void> {
  await switchTo(recallCurrent())
  rememberCurrent(currentId)
}

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
    /** The status of a save refused for a reason retrying cannot fix, if one was. */
    get refused() { return current.refused },
    get saving() { return current.saving },
    /** Why changes are waiting to be saved, if they are: 'offline' or 'busy'. */
    get waiting() { return current.waiting },
    /** How many changes have not reached the server. */
    get pending() { return current.pending },
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
    /**
     * Whether the vault on screen may be looked at and not changed.
     *
     * A reader in a household, and nobody else — your own vault is always
     * yours. Read by the screens to leave out every control that edits, so a
     * reader is never offered a change the server will refuse.
     */
    get readOnly() {
      return isReadOnly()
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
  rememberCurrent(id)

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
    confirmed(id, current.data)
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
    const opened = await Promise.all(
      listed.map(async l => {
        try {
          if (l.wrap_kind !== 'granted') return await openListedHousehold(l, withMEK)
          return await openGranted(l)
        } catch {
          // A household whose key will not open is dropped rather than shown as
          // a name leading nowhere. That includes one whose grant fails its
          // checks — a refused grant is not a household, it is a question.
          return null
        }
      }),
    )
    households = opened.filter((h): h is OpenHousehold => h !== null)
  } catch {
    // Not fatal. Someone whose households could not be listed still has their
    // own vault, and refusing to unlock over it would be the wrong trade.
    households = []
  }

}

/**
 * Open a household whose key somebody else wrapped for us.
 *
 * Costs one extra request — the member list, to learn the granter's verifying
 * key. Only for granted households, and only once per unlock, which is the
 * price of not taking the server's word for who signed something.
 *
 * What is learned is written back: the granter's key is pinned, so a later
 * change is a substitution rather than a surprise, and the epoch becomes the
 * floor for every future grant on this household.
 */
async function openGranted(listing: {
  id: number
  encrypted_name: string
  wrapped_key: string
  role: string
  updated_at: string
}): Promise<OpenHousehold | null> {
  if (!identity || !current.data) return null

  const members = await fetchHouseholdMembers(listing.id)
  const { key, epoch, pin } = await openGrantedKey({
    grant: listing.wrapped_key,
    householdId: listing.id,
    members,
    trust: current.data.trust,
    identity,
  })

  rememberTrust(pin.userId, pin.verifyingKey, listing.id, epoch)

  return {
    id: listing.id,
    name: await openName(listing.encrypted_name, key),
    key,
    role: listing.role,
    updatedAt: listing.updated_at,
  }
}

/**
 * Write down what a verified grant taught us.
 *
 * In the personal vault, because it is this person's record of what they have
 * accepted and nobody else's. Saved rather than merely held, or the next unlock
 * would start over and accept whatever key was there then.
 */
function rememberTrust(userId: number, verifyingKey: string, householdId: number, epoch: number): void {
  const trust = current.data?.trust
  if (!trust) return

  // Only when there is something new to write down: every unlock opens every
  // granted household, and a change queued each time would be a save each time.
  const known =
    trust.pins[String(userId)] === verifyingKey && (trust.epochs[String(householdId)] ?? 0) >= epoch
  if (known) return
  commit('rememberTrust', String(userId), verifyingKey, String(householdId), epoch)
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
  assertNameFits(name)

  const key = await generateHouseholdKey()
  const empty = createEmptyVault(mainAccountName())
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

  households = [{ id: created.id, name, key, role: 'owner', updatedAt: created.updated_at }, ...households]

  // Installed directly rather than through `switchTo`, which would fetch the
  // payload back from the server — a round trip to be told the thing we just
  // encrypted and sent. It would also make creating a household depend on that
  // fetch succeeding, and a `null` answer drops a household from the list.
  await putCurrentAside()
  currentId = created.id
  rememberCurrent(created.id)
  confirmed(created.id, empty)
  current = { ...emptySlot(), data: empty, key, lastUpdatedAt: created.updated_at }

  return created.id
}

/** Rename a household. Its name is a ciphertext, so this re-seals it. */
export async function renameHousehold(id: number, name: string): Promise<void> {
  const household = households.find(h => h.id === id)
  if (!household) return
  assertNameFits(name)

  await putHouseholdName(id, await sealName(name, household.key))
  households = households.map(h => (h.id === id ? { ...h, name } : h))
}

/** Delete a household. Owner only, which the server enforces. */
export async function deleteHousehold(id: number): Promise<void> {
  await removeHousehold(id)
  households = households.filter(h => h.id !== id)
  stashed.delete(id)
  queues.delete(id)
  bases.delete(id)

  if (currentId === id) {
    currentId = 'personal'
    rememberCurrent('personal')
    current = stashed.get('personal') ?? emptySlot()
    stashed.delete('personal')
  }
}

/**
 * Try to restore vault from sessionStorage (page refresh).
 * Returns true if successful, false if no cached MEK.
 */
export async function tryRestoreVault(userId: number): Promise<boolean> {
  const cachedMEK = await restoreMEK()
  if (!cachedMEK) return false
  owner = userId

  try {
    const vaultData = await fetchVault()
    if (vaultData) {
      current.data = await decryptVault(vaultData.ciphertext, vaultData.nonce, cachedMEK)
      confirmed('personal', current.data)
      current.lastUpdatedAt = vaultData.updated_at
    } else {
      current.data = createEmptyVault(mainAccountName())
      current.lastUpdatedAt = null
    }
    mek = cachedMEK
    current.key = cachedMEK
    // A restored session has to be as capable as a freshly unlocked one. If
    // this were left out, reloading the page would silently take away the
    // ability to share a household until the next real sign-in.
    const keys = await fetchVaultKeys()
    identity = await ensureIdentity(keys, cachedMEK)
    await loadHouseholds(cachedMEK)
    unlocked = true
    // After the households are known, so a remembered one can be checked
    // against them rather than switched to on faith.
    await landOnRecalled()
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
export async function initializeVault(
  password: string,
  email: string,
  userId: number,
): Promise<'ok' | 'no-keys' | 'decrypt-failed' | 'version-ahead'> {
  const keys = await fetchVaultKeys()
  if (!keys) return 'no-keys'
  owner = userId

  try {
    const kek = await deriveKEK(password, email, keys.iterations)
    mek = await unwrapMEK(keys.encrypted_mek, kek)
    current.key = mek
    identity = await ensureIdentity(keys, mek)

    const vaultData = await fetchVault()
    if (vaultData) {
      current.data = await decryptVault(vaultData.ciphertext, vaultData.nonce, mek)
      confirmed('personal', current.data)
      current.lastUpdatedAt = vaultData.updated_at
    } else {
      current.data = createEmptyVault(mainAccountName())
      await saveVault()
    }

    await loadHouseholds(mek)
    await cacheMEK(mek)
    unlocked = true
    await landOnRecalled()
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
 * This account's keypair, making one if it has none.
 *
 * Every account made since households existed was born with a keypair, in
 * `setupKeys`. One made before them had none and no way to get one — so it
 * could neither start a household nor accept an invitation, and the screen
 * could only say "set up encryption" to somebody who had long since done so.
 * Made here instead, on unlock, which is the one moment this client holds the
 * vault key the private halves must be sealed under.
 *
 * Never fatal. A failure leaves the account without a keypair, which is where
 * it already was, and the next unlock tries again. If the server refuses
 * because a keypair has appeared in the meantime, it is read back rather than
 * replaced: the server only ever adds one, and a key that could be swapped
 * would break every pin other members hold on it.
 */
async function ensureIdentity(
  keys: Partial<import('./identity').SealedIdentity> | null | undefined,
  withMEK: CryptoKey,
): Promise<OpenIdentity | null> {
  try {
    if (isComplete(keys)) return await openIdentity(keys, withMEK)
    const sealed = await sealIdentity(await generateIdentity(), withMEK)
    try {
      await setupIdentity(sealed)
      return await openIdentity(sealed, withMEK)
    } catch {
      const now = await fetchVaultKeys()
      return isComplete(now) ? await openIdentity(now, withMEK) : null
    }
  } catch {
    return null
  }
}

/**
 * Set up encryption keys for the first time.
 * Returns the recovery key that must be shown to the user.
 */
export async function setupKeys(password: string, email: string, userId: number): Promise<string> {
  owner = userId
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
  current.data = createEmptyVault(mainAccountName())
  await saveVault()
  await cacheMEK(newMEK)
  unlocked = true

  return recoveryKey
}

/**
 * What a new vault's first account is called, in the language in use when the
 * vault is made. It was always "Main" — English written into a French user's
 * vault as data, where no catalogue could reach it.
 */
function mainAccountName(): string {
  return seedNamesFor(getLocale()).mainAccount
}

/** The vault on screen belongs to a household this account may only read. */
function isReadOnly(): boolean {
  if (currentId === 'personal') return false
  return households.find(h => h.id === currentId)?.role === 'reader'
}

/**
 * The input stops at the limit already; this is for anything that reaches the
 * store without passing through it. See `HOUSEHOLD_NAME_MAX`.
 */
function assertNameFits(name: string): void {
  if (name.length > HOUSEHOLD_NAME_MAX) {
    throw new Error(`a household name is at most ${HOUSEHOLD_NAME_MAX} characters`)
  }
}

/**
 * Save the current vault (encrypt + PUT to server).
 */
/** Refusals in a row before giving the others a moment. */
const MAX_REFUSALS = 3

/** How long to wait before trying again, by consecutive failure. */
const RETRY_MS = [2000, 5000, 15000, 30000, 60000]

/**
 * Save the vault on screen, catching up with anybody who saved first.
 *
 * Sends the vault with the `updated_at` it was built on. If the server has a
 * newer one, that is fetched, every change still queued here is applied on top
 * of it (`catchUp`), and the result is sent again. Two people changing
 * different things both keep their change; one change that somebody else made
 * impossible is dropped and reported, and the rest go on without it.
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
  // Each of these is a vault this client must not write over.
  if (slot.conflicted || slot.shapeInvalid || slot.versionAhead || slot.refused) return
  // The screens offer a reader nothing that edits. This is for anything that
  // gets here anyway, so it stops at the door rather than at the server.
  if (isReadOnly()) return
  // Two saves built on the same version would refuse each other. The second
  // waits for the first, and goes after it if anything is still unsaved.
  if (slot.saving) {
    slot.again = true
    return
  }

  slot.saving = true
  try {
    for (let refusals = 0; ; ) {
      const outcome = await attemptSave(slot, id)
      if (outcome === 'saved') {
        slot.waiting = null
        slot.failures = 0
        return
      }
      if (outcome === 'stopped') return
      if (outcome === 'unreachable') return retryLater(slot, 'offline')

      if (++refusals >= MAX_REFUSALS) return retryLater(slot, 'busy')
      const caught = await catchUp(slot, id)
      if (caught === 'unreachable') return retryLater(slot, 'offline')
      if (caught === 'stopped' || !slot.dirty) return
    }
  } finally {
    slot.saving = false
    if (slot.again) {
      slot.again = false
      if (slot.dirty && slot === current) void saveVault()
    }
  }
}

type Attempt = 'saved' | 'refused' | 'unreachable' | 'stopped'

/** One try at sending the vault. */
async function attemptSave(slot: VaultSlot, id: VaultId): Promise<Attempt> {
  if (!slot.data || !slot.key) return 'stopped'

  // Checked before the write, not after the read: a vault that cannot describe
  // itself must not be allowed over one that can. `dirty` stays set, so the UI
  // keeps saying the edits are unsaved rather than implying they landed.
  try {
    assertVaultShape(slot.data)
  } catch {
    slot.shapeInvalid = true
    return 'stopped'
  }

  // What this save carries, taken together and before the first await: the
  // vault as it is now, and the actions that made it so — by identity, not by
  // count, because an amount typed while the save is in flight replaces the
  // last queued action, and that one must stay queued for the next save.
  const sent = $state.snapshot(slot.data) as VaultData
  const carried = new Set(queues.get(id) ?? [])

  let result: { updated_at: string }
  try {
    const { ciphertext, nonce } = await encryptVault(sent, slot.key)
    const body = {
      ciphertext,
      nonce,
      version: sent.version,
      // Omitted when there is no server copy yet: the first save has nothing to
      // conflict with, and sending a token we never received would be a lie.
      ...(slot.lastUpdatedAt === null ? {} : { expected_updated_at: slot.lastUpdatedAt }),
    }
    result = id === 'personal' ? await putVault(body) : await putHouseholdVault(id, body)
  } catch (e) {
    if (e instanceof VaultConflictError) return 'refused'
    if (e instanceof VaultReadOnlyError && typeof id === 'number') {
      await becameReader(slot, id)
      return 'stopped'
    }
    if (e instanceof VaultGoneError && typeof id === 'number') {
      await lostHousehold(slot, id)
      return 'stopped'
    }
    if (e instanceof SessionEndedError) {
      sessionEnded(slot, id)
      return 'stopped'
    }
    // A refusal that is not about the network or the server being down will be
    // refused again however often it is sent. Retrying it would leave the user
    // reading "will retry" for ever; stopping lets the banner say so.
    if (e instanceof VaultSaveError && e.status < 500) {
      slot.refused = e.status
      return 'stopped'
    }
    // No network, a server that is down: worth trying again; the changes are
    // still queued.
    return 'unreachable'
  }

  slot.lastUpdatedAt = result.updated_at
  confirmed(id, sent)
  setQueue(slot, id, (queues.get(id) ?? []).filter(a => !carried.has(a)))
  slot.lastSaved = new Date()
  return 'saved'
}

/**
 * Fetch the newer vault and apply this client's waiting changes on top of it.
 *
 * Tells the user what they need to know and nothing more: a change dropped, a
 * value they wrote over somebody else's — and otherwise only that the screen
 * now shows changes made elsewhere.
 */
async function catchUp(slot: VaultSlot, id: VaultId): Promise<'caught-up' | 'unreachable' | 'stopped'> {
  const fresh = await fetchNewer(slot, id)
  if (fresh === 'unreachable' || fresh === 'stopped') return fresh

  const queue = queues.get(id) ?? []
  const base = bases.get(id)
  const { vault, dropped } = replayAll(fresh.data, queue)
  const lost = new Set(dropped.map(d => d.action))
  const overwrites = base
    ? queue.filter(a => !lost.has(a)).map(a => overwriteBy(base, fresh.data, a)).filter(o => o !== null)
    : []

  confirmed(id, fresh.data)
  slot.lastUpdatedAt = fresh.updatedAt
  slot.data = vault
  setQueue(slot, id, queue.filter(a => !lost.has(a)))

  if (dropped.length > 0) {
    // One line per thing lost, not per action: a dialog's Save is a rename and
    // an amount, and both fall to the same deletion.
    const seen = new Set<string>()
    const items = dropped
      .map(d => ({ subject: d.action.subject, reason: d.reason }))
      .filter(item => {
        const key = `${item.reason}\u0000${item.subject ?? ''}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
    notify({ kind: 'dropped', items })
  }
  for (const o of overwrites) {
    notify({ kind: 'overwritten', subject: o.action.subject ?? '', theirs: o.theirs, mine: o.mine, money: o.money, undo: o.undo })
  }
  if (dropped.length === 0 && overwrites.length === 0) notify({ kind: 'merged' })
  return 'caught-up'
}

/** The vault as the server holds it now, opened. */
async function fetchNewer(
  slot: VaultSlot,
  id: VaultId,
): Promise<{ data: VaultData; updatedAt: string } | 'unreachable' | 'stopped'> {
  const payload = id === 'personal' ? await fetchVault() : await fetchHouseholdVault(id)
  if (!payload || !slot.key) return 'unreachable'
  try {
    return { data: await decryptVault(payload.ciphertext, payload.nonce, slot.key), updatedAt: payload.updated_at }
  } catch (e) {
    if (e instanceof VaultVersionAheadError) {
      // A newer build saved it. Replaying onto data this one cannot read could
      // only corrupt it; the banner says to reload, and how much would be lost.
      slot.versionAhead = true
      return 'stopped'
    }
  }
  // It would not open with the key this client holds. For a household that
  // means the key was changed — somebody left — and a new grant is waiting.
  if (typeof id === 'number' && mek) {
    await loadHouseholds(mek)
    const renewed = households.find(h => h.id === id)?.key
    if (renewed && renewed !== slot.key) {
      slot.key = renewed
      try {
        return { data: await decryptVault(payload.ciphertext, payload.nonce, renewed), updatedAt: payload.updated_at }
      } catch { /* below */ }
    }
  }
  slot.conflicted = true
  return 'stopped'
}

/** Made a reader with changes waiting: they can never be saved, so say how many. */
async function becameReader(slot: VaultSlot, id: number): Promise<void> {
  // What this client believed about its role was out of date, so it takes the
  // server's word, and the screens drop their editing controls. Not thrown: a
  // permission changing under you is news, not a crash.
  households = households.map(h => (h.id === id ? { ...h, role: 'reader' } : h))
  const count = queues.get(id)?.length ?? 0
  setQueue(slot, id, [])
  if (count > 0) notify({ kind: 'readOnly', count })
  // Show the household as it really is, not with changes that will never land.
  const fresh = await fetchNewer(slot, id)
  if (fresh !== 'unreachable' && fresh !== 'stopped') {
    confirmed(id, fresh.data)
    slot.data = fresh.data
    slot.lastUpdatedAt = fresh.updatedAt
  }
}

/** Removed from a household, or it was deleted, with changes waiting. */
async function lostHousehold(slot: VaultSlot, id: number): Promise<void> {
  const name = households.find(h => h.id === id)?.name ?? ''
  const count = queues.get(id)?.length ?? 0
  // Before switching away: switching flushes an unsaved vault first, and this
  // one's save can only be refused again.
  setQueue(slot, id, [])
  queues.delete(id)
  bases.delete(id)
  households = households.filter(h => h.id !== id)
  notify({ kind: 'removed', household: name, count })
  if (currentId === id) await switchTo('personal')
  stashed.delete(id)
}

/**
 * Show what others saved while this tab was in the background.
 *
 * Only when this tab has nothing of its own waiting: with changes queued, the
 * next save catches up anyway and says what it found. One request, on coming
 * back to the tab — not a poll.
 *
 * A preview keeps showing; the real vault behind it is the one brought up to
 * date, and is what the user returns to when the tour ends.
 */
export async function refreshIfQuiet(): Promise<void> {
  const slot = current
  const id = currentId
  if (!slot.data || !slot.key || slot.saving || slot.dirty) return
  if (slot.conflicted || slot.shapeInvalid || slot.versionAhead) return

  const fresh = await fetchNewer(slot, id)
  if (fresh === 'unreachable' || fresh === 'stopped') return
  if (fresh.updatedAt === slot.lastUpdatedAt) return
  // Something was changed here while the request was out; the save that
  // follows will catch up and report, so this one stands back.
  if (slot !== current || slot.dirty) return

  confirmed(id, fresh.data)
  slot.lastUpdatedAt = fresh.updatedAt
  if (slot.parked) {
    slot.parked = fresh.data
    return
  }
  slot.data = fresh.data
  notify({ kind: 'merged' })
}

/**
 * Signed out under this tab — by "Log out everywhere", a password change on
 * another device, an administrator's reset, or the session running out.
 *
 * Retrying cannot help, so this counts what is waiting in every vault, drops
 * it, and goes back to sign-in the way any refused request does. The count is
 * posted after: going back clears the vault, and the notices with it.
 */
function sessionEnded(slot: VaultSlot, id: VaultId): void {
  let count = 0
  for (const queue of queues.values()) count += queue.length
  // Before signing out, which flushes an unsaved vault — into the same 401.
  setQueue(slot, id, [])
  for (const other of stashed.values()) other.dirty = false
  signalUnauthorized()
  notify({ kind: 'signedOut', count })
}

/**
 * The session watch found this tab signed out. Goes the way a save refused with
 * a 401 does, so changes still waiting are counted and reported rather than
 * dropped with the vault in silence.
 */
export function sessionEndedElsewhere(): void {
  sessionEnded(current, currentId)
}

/** Keep the changes, and try again after a pause that grows with each failure. */
function retryLater(slot: VaultSlot, why: 'offline' | 'busy'): void {
  slot.waiting = why
  const delay = RETRY_MS[Math.min(slot.failures, RETRY_MS.length - 1)]
  slot.failures++
  if (slot === current) scheduleSave(delay)
}

function scheduleSave(delay = 2000): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveVault()
  }, delay)
}

/** Put a value somebody else had chosen back, from the overwrite notice. */
export function undoOverwrite(undo: Action): void {
  commit(undo.kind, ...(undo.args as ActionArgs<typeof undo.kind>))
}

/**
 * Change the vault on screen, and keep the change so it can be applied again.
 *
 * What every edit goes through: one call that applies the engine function,
 * queues it as an action, and schedules the save. If somebody else saves
 * first, the queue is what gets applied on top of their vault (see `sync/`).
 *
 * The arguments are copied out of any reactive state before they are kept: an
 * action must record what was asked, not follow the form it was typed into.
 *
 * Whatever the engine throws is thrown on, and nothing is queued — a change
 * refused on screen is not one to save.
 */
export function commit<K extends ActionKind>(kind: K, ...args: ActionArgs<K>): ActionResult<K> {
  const vault = current.data
  if (!vault) throw new Error('no vault is open')
  const plain = $state.snapshot(args) as ActionArgs<K>
  const { action, result } = perform(vault, kind, plain)

  // A preview is a throwaway copy, and a reader's vault cannot be saved: the
  // change shows, as it always has, and nothing is kept to save.
  if (current.parked || isReadOnly()) return result

  setQueue(current, currentId, enqueue(queues.get(currentId) ?? [], action as Action))
  // Waiting out a retry already: the change joins the queue and goes with it.
  if (!current.waiting) scheduleSave()
  return result
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
  try {
    sessionStorage.removeItem(CURRENT_VAULT_KEY)
  } catch { /* see rememberCurrent */ }
  // LAST_VAULT_KEY stays: the next sign-in is what it is for.
  owner = null
  // Every vault, not only the one on screen. A stashed slot holds a household's
  // decrypted budget and its key, and letting that outlive a sign-out would be
  // the same mistake as leaving the MEK behind.
  stashed.clear()
  queues.clear()
  bases.clear()
  clearNotices()
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
  userId: number,
): Promise<void> {
  owner = userId
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
  identity = await ensureIdentity(result, recoveredMEK)

  const vaultData = await fetchVault()
  if (vaultData) {
    current.data = await decryptVault(vaultData.ciphertext, vaultData.nonce, recoveredMEK)
    current.lastUpdatedAt = vaultData.updated_at
  } else {
    current.data = createEmptyVault(mainAccountName())
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

// Back online, or back in front of the user: try what is waiting now rather
// than at the end of a backoff that may have grown to a minute.
if (typeof window !== 'undefined') {
  const tryNow = () => {
    if (current.dirty && !current.saving) void saveVault()
  }
  window.addEventListener('online', tryNow)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return
    if (current.dirty) tryNow()
    else void refreshIfQuiet()
  })
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

// --- inviting somebody into a household ---

/**
 * A pending invitation, with its link rebuilt where that is possible.
 *
 * The server still holds only the token's *hash*, so a leaked database hands
 * nobody an invitation. The link comes back from the secret and the token
 * sealed beside it, under the household key — which a member has and the server
 * does not. Empty for anybody but the owner, who is the only one who could do
 * anything with it.
 */
export interface PendingInvite extends HouseholdInvite {
  /** The MAC checks out: the offered key really is the invitee's. */
  verified: boolean
  /** Rebuilt from the sealed halves. Empty unless this user is the owner. */
  link: string
}

/**
 * Ask somebody to join, and produce the link to hand them.
 *
 * The secret is generated here, travels in the link, and is *never* sent to the
 * server — only a copy sealed under the household key, so a member can read it
 * back at confirm time. Without that, confirming would only work from the tab
 * that created the invitation.
 */
export async function inviteToHousehold(householdId: number, email: string, role: string): Promise<string> {
  const household = households.find(h => h.id === householdId)
  if (!household) throw new Error('no such household')

  const token = generateInviteToken()
  const secret = generateInviteSecret()

  await createHouseholdInvite(householdId, {
    token_hash: await hashInviteToken(token),
    invited_email: email,
    secret_sealed: await sealUnder(secret, household.key),
    // Sealed too, so the code can be shown again. Show-once bought nothing:
    // withdrawing and re-inviting always produced an equivalent link, so the
    // restriction only ever cost somebody who got interrupted.
    token_sealed: await sealUnder(new TextEncoder().encode(token), household.key),
    role,
  })

  return inviteLink(token, secret)
}

/**
 * The link itself.
 *
 * Both halves in the fragment rather than the query string: a fragment is not
 * sent to the server on navigation and does not turn up in its logs, which for
 * the secret is the entire point.
 */
function inviteLink(token: string, secret: Uint8Array): string {
  const base = typeof window === 'undefined' ? '' : window.location.origin
  return `${base}/join#t=${encodeURIComponent(token)}&s=${encodeURIComponent(toBase64(secret))}`
}

/**
 * The invitations on a household, with each one's link and whether it may be
 * confirmed.
 *
 * "May be confirmed" means the MAC checks out: the key the server is offering
 * really does belong to whoever held the link. A pending invitation that fails
 * this is the one thing in the app that should stop somebody in their tracks.
 */
export async function loadInvites(householdId: number): Promise<PendingInvite[]> {
  const household = households.find(h => h.id === householdId)
  if (!household) return []

  const invites = await fetchHouseholdInvites(householdId)
  return Promise.all(
    invites.map(async invite => {
      // Absent for anybody but the owner, who is the only one who could use it.
      if (!invite.secret_sealed) return { ...invite, verified: false, link: '' }

      const secret = await openUnder(invite.secret_sealed, household.key)
      const verified =
        !!invite.public_key_mac &&
        !!invite.public_key &&
        (await verifyPublicKeyMAC(secret, fromBase64(invite.public_key), invite.public_key_mac))

      const link = invite.token_sealed
        ? inviteLink(new TextDecoder().decode(await openUnder(invite.token_sealed, household.key)), secret)
        : ''

      return { ...invite, verified, link }
    }),
  )
}

/**
 * Whether a household this account was invited to has been granted yet.
 *
 * For the invitee's waiting screen. Membership — and so the household in the
 * listing — exists only once the owner has confirmed, so the listing is the
 * thing to watch; when it appears, the households are opened again so it can be
 * switched to. One request per call, and the screen calls it only while it is
 * waiting.
 */
export async function householdArrived(householdId: number): Promise<boolean> {
  if (!mek) return false
  let listed
  try {
    listed = await fetchHouseholds()
  } catch {
    return false
  }
  if (!listed.some(h => h.id === householdId)) return false
  await loadHouseholds(mek)
  return households.some(h => h.id === householdId)
}

/**
 * Hand over the household key, signed so the recipient can tell it was us.
 *
 * Refuses unless the MAC checks out. The MAC is the only thing standing between
 * this and wrapping the household key to a key the server chose — so it is
 * checked here, at the moment of granting, rather than trusted from a flag
 * something else computed earlier.
 */
export async function confirmMember(householdId: number, invite: HouseholdInvite): Promise<void> {
  const household = households.find(h => h.id === householdId)
  if (!household || !identity) throw new Error('not ready')
  if (!invite.public_key || !invite.verifying_key || !invite.public_key_mac) {
    throw new Error('this invitation has not been accepted yet')
  }
  // Absent for anybody but the owner, and granting is the owner's alone — so
  // its absence is a refusal rather than something to work around.
  if (!invite.secret_sealed) {
    throw new Error('only the owner may let somebody in')
  }

  const secret = await openUnder(invite.secret_sealed, household.key)
  const publicKey = fromBase64(invite.public_key)
  if (!(await verifyPublicKeyMAC(secret, publicKey, invite.public_key_mac))) {
    throw new Error('the key offered for this person does not match the invitation')
  }

  const listing = (await fetchHouseholds()).find(h => h.id === householdId)
  const grant = await sealGrant({
    householdKey: household.key,
    householdId,
    epoch: listing?.key_epoch ?? 1,
    recipientPublicKey: await importPublicKey(invite.public_key),
    recipientVerifyingKey: fromBase64(invite.verifying_key),
    senderSigningKey: identity.signingKey,
    senderVerifyingKey: identity.verifyingKey,
  })

  await confirmHouseholdInvite(householdId, { invite_id: invite.id, wrapped_key: grant })
}

/**
 * Take an invitation link and bind this account to it.
 *
 * Grants nothing. Afterwards the household is still unreadable — a member has
 * to confirm before any key exists for us. What this does is prove, to whoever
 * invited us, that the public key the server will offer them is really ours.
 */
export async function acceptInvite(token: string, secret: Uint8Array): Promise<number> {
  if (!identity) throw new Error('Vault not unlocked')

  const keys = await fetchVaultKeys()
  if (!keys?.public_key) throw new Error('no identity to prove')

  const mac = await macPublicKey(secret, fromBase64(keys.public_key))
  const { household_id } = await acceptHouseholdInvite(token, mac)
  return household_id
}

/** Move somebody between writer and reader. Owner only, which the server holds. */
export async function changeRole(householdId: number, userId: number, role: string): Promise<void> {
  await changeHouseholdRole(householdId, userId, role)
}

export async function withdrawInvite(householdId: number, inviteId: number): Promise<void> {
  await deleteHouseholdInvite(householdId, inviteId)
}

export async function listMembers(householdId: number): Promise<HouseholdMember[]> {
  return fetchHouseholdMembers(householdId)
}

/**
 * Remove somebody, or leave.
 *
 * `leaving` rather than a comparison inside here: this module has no idea which
 * account is signed in, and the version that tried to keep one never had it set
 * — so leaving deleted the membership, left the household on screen, and then
 * failed its own refresh because the person doing it was no longer allowed to
 * list the members. It worked and reported failure, which is worse than not
 * working.
 *
 * Note what removal does not do: it stops the server serving them new
 * ciphertext, it does not take back the key they already hold. Only a rekey
 * does that, and only for what is written afterwards.
 */
export async function removeMember(householdId: number, userId: number, leaving = false): Promise<void> {
  await removeHouseholdMember(householdId, userId)
  if (!leaving) return

  // Nothing here is ours any more, so it goes rather than being reloaded.
  households = households.filter(h => h.id !== householdId)
  stashed.delete(householdId)
  if (currentId === householdId) await switchTo('personal')
}

