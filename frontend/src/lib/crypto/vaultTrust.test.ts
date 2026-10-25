import { describe, test, expect, beforeEach, vi } from 'vitest'

// The server is mocked: what is tested is what this client accepts from it.
vi.mock('../api/client', () => ({
  fetchVaultKeys: vi.fn(), setupVaultKeys: vi.fn(), setupIdentity: vi.fn(), updateVaultKeys: vi.fn(),
  fetchVault: vi.fn(async () => null),
  putVault: vi.fn(async () => ({ updated_at: '2026-01-01T00:00:00Z' })),
  recoverVaultKeys: vi.fn(), VaultConflictError: class extends Error {},
  fetchHouseholds: vi.fn(async () => []), createHousehold: vi.fn(),
  fetchHouseholdVault: vi.fn(async () => null),
  putHouseholdVault: vi.fn(async () => ({ status: 'ok', updated_at: '2026-02-02T00:00:00Z' })),
  renameHousehold: vi.fn(), deleteHousehold: vi.fn(), removeHouseholdMember: vi.fn(),
  fetchHouseholdMembers: vi.fn(async () => []), fetchHouseholdInvites: vi.fn(async () => []),
  createHouseholdInvite: vi.fn(), deleteHouseholdInvite: vi.fn(), acceptHouseholdInvite: vi.fn(),
  confirmHouseholdInvite: vi.fn(), changeHouseholdRole: vi.fn(), rekeyHousehold: vi.fn(),
}))

import { createEmptyVault, encryptVault, decryptVault } from './vault'
import { generateHouseholdKey, sealKeyForSelf, sealName } from './household'
import { generateIdentity, sealIdentity } from './identity'
import { sealGrant } from './grant'
import { toBase64 } from './bytes'
import * as client from '../api/client'
import { getVaultState, tryRestoreVault, clearVault, switchTo, householdArrived, refreshIfQuiet, saveVault } from './vaultStore.svelte'

const api = client as unknown as Record<string, ReturnType<typeof vi.fn>>
const state = getVaultState()
const raw = async (k: CryptoKey) => toBase64(new Uint8Array(await crypto.subtle.exportKey('raw', k)))

/**
 * Signed in as user 42, whose personal vault has verified household 5: its
 * owner, user 7, is pinned, and the household's key is at epoch 4. Household 9
 * is 42's own. Then the listing changes to a grant for household 5 under
 * another key, at an earlier epoch, signed by a key that is not 7's — which the
 * member list now claims is 7's.
 */
async function signedInThenSubstituted() {
  const mek = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
  sessionStorage.setItem('vault_mek', toBase64(new Uint8Array(await crypto.subtle.exportKey('raw', mek))))
  const me = await generateIdentity(), owner = await generateIdentity(), stranger = await generateIdentity()
  api.fetchVaultKeys.mockResolvedValue({ encrypted_mek: 'x', iterations: 1000, ...(await sealIdentity(me, mek)) })

  const personal = createEmptyVault('Main')
  personal.trust.pins['7'] = toBase64(owner.verifyingKey)
  personal.trust.epochs['5'] = 4
  api.fetchVault.mockResolvedValue({ ...(await encryptVault(personal, mek)), version: 11, updated_at: '2026-10-01T00:00:00Z' })

  const key9 = await generateHouseholdKey(), key5 = await generateHouseholdKey()
  const grant = await sealGrant({
    householdKey: key5, householdId: 5, epoch: 4,
    recipientPublicKey: me.encryption.publicKey, recipientVerifyingKey: me.verifyingKey,
    senderSigningKey: owner.signingKey, senderVerifyingKey: owner.verifyingKey,
  })
  const own = { id: 9, encrypted_name: await sealName('Own', key9), wrapped_key: await sealKeyForSelf(key9, mek), wrap_kind: 'self', role: 'owner', version: 11, key_epoch: 1, updated_at: '' }
  const granted = { id: 5, encrypted_name: await sealName('Flat', key5), wrapped_key: grant, wrap_kind: 'granted', role: 'writer', version: 11, key_epoch: 4, updated_at: '' }
  api.fetchHouseholds.mockResolvedValue([own, granted])
  api.fetchHouseholdMembers.mockResolvedValue([
    { user_id: 7, verifying_key: toBase64(owner.verifyingKey) },
    { user_id: 42, verifying_key: toBase64(me.verifyingKey) },
  ])
  api.fetchHouseholdVault.mockImplementation(async (id: number) =>
    id === 9 ? { ...(await encryptVault(createEmptyVault('Main'), key9)), version: 11, updated_at: '2026-10-01T00:00:00Z' } : null)

  expect(await tryRestoreVault(42)).toBe(true)
  expect(await raw(state.households.find(h => h.id === 5)!.key)).toBe(await raw(key5))

  const otherKey = await generateHouseholdKey()
  const substituted = await sealGrant({
    householdKey: otherKey, householdId: 5, epoch: 2,
    recipientPublicKey: me.encryption.publicKey, recipientVerifyingKey: me.verifyingKey,
    senderSigningKey: stranger.signingKey, senderVerifyingKey: stranger.verifyingKey,
  })
  api.fetchHouseholds.mockResolvedValue([own, { ...granted, encrypted_name: await sealName('Flat', otherKey), wrapped_key: substituted }])
  api.fetchHouseholdMembers.mockResolvedValue([
    { user_id: 7, verifying_key: toBase64(stranger.verifyingKey) },
    { user_id: 42, verifying_key: toBase64(me.verifyingKey) },
  ])
  return { key9, key5 }
}

beforeEach(() => {
  clearVault()
  sessionStorage.clear()
  localStorage.clear()
  vi.clearAllMocks()
})

// A grant is checked against this person's own record of whom they have
// verified — the personal vault's — whichever vault is on screen. A household's
// vault holds no such record of theirs: any of its writers could put one there.
describe('grants are checked against the personal record', () => {
  test('with the personal vault on screen, a substituted key is refused', async () => {
    await signedInThenSubstituted()

    await householdArrived(5)

    expect(state.households.find(h => h.id === 5)).toBeUndefined()
  })

  test('with another household on screen, a substituted key is refused too', async () => {
    const { key9 } = await signedInThenSubstituted()
    await switchTo(9)

    await householdArrived(5)

    expect(state.households.find(h => h.id === 5)).toBeUndefined()
    // And nothing about it was written into the household on screen.
    await saveVault()
    for (const [id, body] of api.putHouseholdVault.mock.calls) {
      if (id !== 9) continue
      const saved = await decryptVault(body.ciphertext, body.nonce, key9)
      expect(saved.trust.pins).toEqual({})
      expect(saved.trust.epochs).toEqual({})
    }
  })

  test('a household that stops decrypting does not lower the bar either', async () => {
    await signedInThenSubstituted()
    await switchTo(9)
    // Household 9's payload no longer opens, so the households are listed again.
    const unrelated = await generateHouseholdKey()
    api.fetchHouseholdVault.mockImplementation(async () => ({ ...(await encryptVault(createEmptyVault('Main'), unrelated)), version: 11, updated_at: '2026-10-02T00:00:00Z' }))

    await refreshIfQuiet()

    expect(state.households.find(h => h.id === 5)).toBeUndefined()
  })
})
