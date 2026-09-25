import { describe, test, expect, beforeEach, vi } from 'vitest'
import { createEmptyVault, encryptVault, type VaultData } from './vault'
import { generateHouseholdKey, sealKeyForSelf, sealName } from './household'

// The real store and the real crypto, with only the network stubbed. Mocking
// either of the first two would leave the thing under test unexercised.
//
// The factory is inline because `vi.mock` is hoisted above every const in the
// file; the handles come back afterwards by importing the mocked module.
vi.mock('../api/client', () => ({
  fetchVaultKeys: vi.fn(async () => ({ encrypted_mek: '', iterations: 600000 })),
  setupVaultKeys: vi.fn(),
  updateVaultKeys: vi.fn(),
  fetchVault: vi.fn(async () => null),
  putVault: vi.fn(async () => ({ updated_at: '2026-01-01T00:00:00Z' })),
  recoverVaultKeys: vi.fn(),
  VaultConflictError: class extends Error {},
  fetchHouseholds: vi.fn(async () => []),
  createHousehold: vi.fn(async () => ({ id: 1, updated_at: '2026-01-01T00:00:00Z' })),
  fetchHouseholdVault: vi.fn(async () => null),
  putHouseholdVault: vi.fn(async () => ({ status: 'ok', updated_at: '2026-02-02T00:00:00Z' })),
  renameHousehold: vi.fn(),
  deleteHousehold: vi.fn(),
  removeHouseholdMember: vi.fn(),
  fetchHouseholdMembers: vi.fn(async () => []),
  fetchHouseholdInvites: vi.fn(async () => []),
  createHouseholdInvite: vi.fn(),
  deleteHouseholdInvite: vi.fn(),
  acceptHouseholdInvite: vi.fn(),
  confirmHouseholdInvite: vi.fn(),
  changeHouseholdRole: vi.fn(),
  rekeyHousehold: vi.fn(),
}))

import * as client from '../api/client'
const api = client as unknown as Record<string, ReturnType<typeof vi.fn>>

import {
  getVaultState, tryRestoreVault, clearVault, switchTo, markDirty, saveVault,
  createHousehold, renameHousehold, deleteHousehold, removeMember,
} from './vaultStore.svelte'

const state = getVaultState()

/** A household as the server would list it, sealed for this MEK. */
async function listed(id: number, name: string, mek: CryptoKey, isOwner = true) {
  const key = await generateHouseholdKey()
  return {
    listing: {
      id,
      encrypted_name: await sealName(name, key),
      wrapped_key: await sealKeyForSelf(key, mek),
      wrap_kind: 'self',
      is_owner: isOwner,
      version: 8,
      updated_at: '2026-01-01T00:00:00Z',
    },
    key,
  }
}

/** Puts a MEK where `tryRestoreVault` will find it, as a page reload would. */
async function signIn(): Promise<CryptoKey> {
  const mek = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
  const raw = await crypto.subtle.exportKey('raw', mek)
  sessionStorage.setItem('vault_mek', btoa(String.fromCharCode(...new Uint8Array(raw))))
  return mek
}

beforeEach(() => {
  clearVault()
  vi.clearAllMocks()
  api.fetchVault.mockResolvedValue(null)
  api.fetchHouseholds.mockResolvedValue([])
  api.fetchHouseholdVault.mockResolvedValue(null)
  api.putVault.mockResolvedValue({ updated_at: '2026-01-01T00:00:00Z' })
  api.putHouseholdVault.mockResolvedValue({ status: 'ok', updated_at: '2026-02-02T00:00:00Z' })
})

describe('listing households', () => {
  test('opens their names at unlock, without fetching a single payload', async () => {
    const mek = await signIn()
    const anna = await listed(3, 'Flat with Anna', mek)
    api.fetchHouseholds.mockResolvedValue([anna.listing])

    await tryRestoreVault()

    expect(state.households.map(h => h.name)).toEqual(['Flat with Anna'])
    // The whole reason the name is its own ciphertext: a menu should not cost
    // one payload fetch per entry.
    expect(api.fetchHouseholdVault).not.toHaveBeenCalled()
  })

  test('drops one whose key will not open rather than naming it', async () => {
    const mek = await signIn()
    const mine = await listed(3, 'Mine', mek)
    const theirs = await listed(4, 'Theirs', await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']))
    api.fetchHouseholds.mockResolvedValue([mine.listing, theirs.listing])

    await tryRestoreVault()

    expect(state.households.map(h => h.name)).toEqual(['Mine'])
  })

  test('a listing failure still leaves the personal vault usable', async () => {
    await signIn()
    api.fetchHouseholds.mockRejectedValue(new Error('offline'))

    expect(await tryRestoreVault()).toBe(true)
    expect(state.unlocked).toBe(true)
    expect(state.households).toEqual([])
  })
})

describe('switching', () => {
  async function withHousehold() {
    const mek = await signIn()
    const anna = await listed(3, 'Flat with Anna', mek)
    api.fetchHouseholds.mockResolvedValue([anna.listing])
    await tryRestoreVault()

    const householdData = createEmptyVault()
    householdData.budget.categories.push({ id: 'h', name: 'Rent', side: 'expense', sortOrder: 1 })
    const payload = await encryptVault(householdData, anna.key)
    api.fetchHouseholdVault.mockResolvedValue({ ...payload, version: 8, updated_at: '2026-03-03T00:00:00Z' })
    return { mek, anna }
  }

  test('fetches and decrypts the payload on first switch', async () => {
    await withHousehold()

    await switchTo(3)

    expect(state.currentVaultId).toBe(3)
    expect(state.currentHousehold?.name).toBe('Flat with Anna')
    expect(state.vault?.budget.categories[0].name).toBe('Rent')
  })

  test('keeps each vault’s data apart', async () => {
    await withHousehold()
    const personal = state.vault as VaultData
    personal.budget.categories.push({ id: 'p', name: 'Mine only', side: 'expense', sortOrder: 1 })

    await switchTo(3)
    expect(state.vault?.budget.categories.map(c => c.name)).toEqual(['Rent'])

    await switchTo('personal')
    expect(state.vault?.budget.categories.map(c => c.name)).toEqual(['Mine only'])
  })

  test('does not refetch a household it has already opened', async () => {
    await withHousehold()

    await switchTo(3)
    await switchTo('personal')
    await switchTo(3)

    expect(api.fetchHouseholdVault).toHaveBeenCalledTimes(1)
  })

  // A slot put away while still dirty, with a live timer, would try to save
  // itself once a different vault was on screen — and saveVault writes whatever
  // is current.
  test('flushes an unsaved edit before putting a vault aside', async () => {
    await withHousehold()
    markDirty()

    await switchTo(3)

    expect(api.putVault).toHaveBeenCalledTimes(1)
    expect(api.putHouseholdVault).not.toHaveBeenCalled()
  })

  test('an unsaved warning belongs to its own vault', async () => {
    await withHousehold()
    await switchTo(3)
    markDirty()
    expect(state.dirty).toBe(true)

    await switchTo('personal')
    expect(state.dirty).toBe(false)
  })

  test('refuses to switch to a household that is not ours', async () => {
    await withHousehold()

    await switchTo(999)

    expect(state.currentVaultId).toBe('personal')
    expect(api.fetchHouseholdVault).not.toHaveBeenCalled()
  })

  test('drops a household whose payload has gone', async () => {
    await withHousehold()
    api.fetchHouseholdVault.mockResolvedValue(null)

    await switchTo(3)

    expect(state.households).toEqual([])
    expect(state.currentVaultId).toBe('personal')
  })
})

describe('saving', () => {
  async function onHousehold() {
    const mek = await signIn()
    const anna = await listed(3, 'Flat with Anna', mek)
    api.fetchHouseholds.mockResolvedValue([anna.listing])
    await tryRestoreVault()
    const payload = await encryptVault(createEmptyVault(), anna.key)
    api.fetchHouseholdVault.mockResolvedValue({ ...payload, version: 8, updated_at: '2026-03-03T00:00:00Z' })
    await switchTo(3)
  }

  test('writes a household to its own endpoint, not the personal one', async () => {
    await onHousehold()

    await saveVault()

    expect(api.putHouseholdVault).toHaveBeenCalledTimes(1)
    expect(api.putHouseholdVault.mock.calls[0][0]).toBe(3)
    expect(api.putVault).not.toHaveBeenCalled()
  })

  test('sends the precondition it was given for that vault', async () => {
    await onHousehold()

    await saveVault()

    expect(api.putHouseholdVault.mock.calls[0][1]).toMatchObject({
      expected_updated_at: '2026-03-03T00:00:00Z',
    })
  })

  test('writes the personal vault to the personal endpoint', async () => {
    await signIn()
    await tryRestoreVault()

    await saveVault()

    expect(api.putVault).toHaveBeenCalled()
    expect(api.putHouseholdVault).not.toHaveBeenCalled()
  })
})

describe('creating, renaming and deleting', () => {
  test('creating one switches to it and names it', async () => {
    await signIn()
    await tryRestoreVault()
    api.createHousehold.mockResolvedValue({ id: 7, updated_at: '2026-04-04T00:00:00Z' })

    const id = await createHousehold('Zuhause')

    expect(id).toBe(7)
    expect(state.currentVaultId).toBe(7)
    expect(state.currentHousehold?.name).toBe('Zuhause')
    // Nothing about the new household reached the server in the clear.
    const sent = api.createHousehold.mock.calls[0][0]
    expect(JSON.stringify(sent)).not.toContain('Zuhause')
  })

  test('renaming re-seals the name', async () => {
    const mek = await signIn()
    const anna = await listed(3, 'Old', mek)
    api.fetchHouseholds.mockResolvedValue([anna.listing])
    await tryRestoreVault()

    await renameHousehold(3, 'New')

    expect(state.households[0].name).toBe('New')
    expect(api.renameHousehold.mock.calls[0][1]).not.toContain('New')
  })

  test('deleting the one on screen falls back to the personal vault', async () => {
    const mek = await signIn()
    const anna = await listed(3, 'Flat', mek)
    api.fetchHouseholds.mockResolvedValue([anna.listing])
    await tryRestoreVault()
    const payload = await encryptVault(createEmptyVault(), anna.key)
    api.fetchHouseholdVault.mockResolvedValue({ ...payload, version: 8, updated_at: 'x' })
    await switchTo(3)

    await deleteHousehold(3)

    expect(state.currentVaultId).toBe('personal')
    expect(state.households).toEqual([])
  })
})

describe('signing out', () => {
  test('takes every vault, not only the one on screen', async () => {
    const mek = await signIn()
    const anna = await listed(3, 'Flat', mek)
    api.fetchHouseholds.mockResolvedValue([anna.listing])
    await tryRestoreVault()
    const payload = await encryptVault(createEmptyVault(), anna.key)
    api.fetchHouseholdVault.mockResolvedValue({ ...payload, version: 8, updated_at: 'x' })
    await switchTo(3)
    await switchTo('personal') // household is now stashed, decrypted, with its key

    clearVault()

    expect(state.households).toEqual([])
    expect(state.vault).toBeNull()
    expect(state.mek).toBeNull()
    expect(state.identity).toBeNull()
    expect(state.unlocked).toBe(false)
    expect(state.currentVaultId).toBe('personal')

    // And the stash is really gone: switching back finds nothing to restore,
    // rather than handing over a household from the previous session.
    await switchTo(3)
    expect(state.vault).toBeNull()
  })
})

/**
 * Creating a household opens it, and a reload keeps it open.
 *
 * The second half is the one that was missing: `currentId` was never persisted,
 * so every refresh dropped the user back on their personal budget and they had
 * to go and find their household again.
 */
describe('staying where you were', () => {
  async function withHouseholds() {
    const mek = await signIn()
    const anna = await listed(3, 'Flat with Anna', mek)
    api.fetchHouseholds.mockResolvedValue([anna.listing])
    const payload = await encryptVault(createEmptyVault(), anna.key)
    api.fetchHouseholdVault.mockResolvedValue({ ...payload, version: 9, updated_at: 'x' })
    return mek
  }

  test('creating a household opens it, without being asked twice', async () => {
    await signIn()
    await tryRestoreVault()
    api.createHousehold.mockResolvedValue({ id: 7, updated_at: 'x' })

    await createHousehold('Zuhause')

    expect(state.currentVaultId).toBe(7)
  })

  test('and a reload lands back on it', async () => {
    await withHouseholds()
    await tryRestoreVault()
    await switchTo(3)
    expect(state.currentVaultId).toBe(3)

    // What a refresh does: the module state goes, the session storage stays.
    clearVaultKeepingSession()
    await tryRestoreVault()

    expect(state.currentVaultId).toBe(3)
  })

  test('a household that has since gone falls back to personal', async () => {
    await withHouseholds()
    await tryRestoreVault()
    await switchTo(3)

    clearVaultKeepingSession()
    // Signed in again, but that household is no longer theirs.
    api.fetchHouseholds.mockResolvedValue([])
    await tryRestoreVault()

    expect(state.currentVaultId).toBe('personal')
  })

  test('signing out forgets it, so the next person starts on their own', async () => {
    await withHouseholds()
    await tryRestoreVault()
    await switchTo(3)

    clearVault()
    await withHouseholds()
    await tryRestoreVault()

    expect(state.currentVaultId).toBe('personal')
  })
})

/**
 * A reload, as far as the store is concerned: everything in memory goes, and
 * sessionStorage does not. `clearVault` is sign-out and clears both, so it
 * cannot stand in for this.
 */
function clearVaultKeepingSession() {
  const mek = sessionStorage.getItem('vault_mek')
  const current = sessionStorage.getItem('vault_current')
  clearVault()
  if (mek) sessionStorage.setItem('vault_mek', mek)
  if (current) sessionStorage.setItem('vault_current', current)
}

/**
 * Leaving used to work and report failure.
 *
 * The membership was deleted, then the panel reloaded the members — which the
 * person who had just left was no longer allowed to do — so an error appeared
 * and the household stayed on screen. It looked exactly like nothing had
 * happened, which is the worst thing a destructive action can look like.
 */
describe('leaving a household', () => {
  async function inOne() {
    const mek = await signIn()
    const anna = await listed(3, 'Flat with Anna', mek)
    api.fetchHouseholds.mockResolvedValue([anna.listing])
    await tryRestoreVault()
    const payload = await encryptVault(createEmptyVault(), anna.key)
    api.fetchHouseholdVault.mockResolvedValue({ ...payload, version: 9, updated_at: 'x' })
  }

  test('takes the household off the list', async () => {
    await inOne()
    expect(state.households).toHaveLength(1)

    await removeMember(3, 42, true)

    expect(state.households).toHaveLength(0)
  })

  test('and brings you back to your own budget if you were in it', async () => {
    await inOne()
    await switchTo(3)
    expect(state.currentVaultId).toBe(3)

    await removeMember(3, 42, true)

    expect(state.currentVaultId).toBe('personal')
  })

  // Removing somebody else leaves the household exactly where it was — it is
  // still yours, and the panel refreshes rather than folding up.
  test('removing somebody else leaves it alone', async () => {
    await inOne()

    await removeMember(3, 99, false)

    expect(state.households).toHaveLength(1)
  })
})
