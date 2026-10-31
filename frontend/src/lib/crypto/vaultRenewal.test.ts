import { describe, test, expect, vi } from 'vitest'
import { createEmptyVault, encryptVault, decryptVault } from './vault'
import { generateHouseholdKey, sealKeyForSelf, openKeyFromSelf, sealName, openName } from './household'
import { generateIdentity, sealIdentity, openUnder } from './identity'
import { generateMEK, wrapMEK, unwrapMEK, derivePasswordKeys, deriveRecoveryKeys } from './keys'

// Real keys throughout: what is tested is that everything sealed under the old
// vault key opens under the new one, and that nothing is left behind.

vi.mock('../api/client', () => ({
  fetchVaultKeys: vi.fn(),
  fetchVault: vi.fn(),
  fetchHouseholds: vi.fn(),
  setupVaultKeys: vi.fn(),
  setupIdentity: vi.fn(),
  updateVaultKeys: vi.fn(),
  putVault: vi.fn(async () => ({ updated_at: '2026-10-25T00:00:00Z' })),
  recoverVaultKeys: vi.fn(),
  VaultConflictError: class extends Error {},
  fetchHouseholdVault: vi.fn(async () => null),
  fetchHouseholdMembers: vi.fn(async () => []),
  fetchHouseholdInvites: vi.fn(async () => []),
}))

import * as client from '../api/client'
const api = client as unknown as Record<string, ReturnType<typeof vi.fn>>

import { initializeVault, prepareRenewal } from './vaultStore.svelte'

describe('renewing the vault key', () => {
  test('everything sealed under the old key opens under the new one, and only there', async () => {
    const email = 'anna@example.ch'
    const current = await derivePasswordKeys('the old password', email, 1000)
    const mek = await generateMEK()
    const sealed = await sealIdentity(await generateIdentity(), mek)
    const data = createEmptyVault('Main')
    const stored = await encryptVault(data, mek)
    const householdKey = await generateHouseholdKey()

    api.fetchVaultKeys.mockResolvedValue({ encrypted_mek: await wrapMEK(mek, current.vaultKEK), iterations: 1000, recovery_version: 2, ...sealed })
    api.fetchVault.mockResolvedValue({ ...stored, version: 11, updated_at: '2026-10-24T12:00:00.123456Z' })
    api.fetchHouseholds.mockResolvedValue([
      { id: 3, encrypted_name: await sealName('Home', householdKey), wrapped_key: await sealKeyForSelf(householdKey, mek), wrap_kind: 'self', role: 'owner', version: 1, key_epoch: 1, updated_at: '' },
      // Granted to this account's public key, which renewal does not change.
      { id: 4, encrypted_name: 'x', wrapped_key: 'granted-blob', wrap_kind: 'granted', role: 'writer', version: 1, key_epoch: 1, updated_at: '' },
    ])
    expect(await initializeVault(current, 7, 2)).toBe('ok')

    const next = await derivePasswordKeys('a new password', email, 1000)
    const renewal = await prepareRenewal(next)
    const body = renewal.body as Record<string, any>
    const newMEK = renewal.newMEK

    // The MEK, under the new password and under the new recovery key.
    expect(await exported(await unwrapMEK(body.encrypted_mek, next.vaultKEK))).toEqual(await exported(newMEK))
    const recovery = await deriveRecoveryKeys(renewal.recoveryKey)
    expect(body.recovery_auth).toBe(recovery.recoveryAuth)
    expect(await exported(await unwrapMEK(body.encrypted_mek_recovery, recovery.recoveryKEK))).toEqual(await exported(newMEK))

    // The vault, read at the updated_at it is guarded by.
    expect(body.vault.expected_updated_at).toBe('2026-10-24T12:00:00.123456Z')
    expect(await decryptVault(body.vault.ciphertext, body.vault.nonce, newMEK)).toEqual(data)
    await expect(decryptVault(body.vault.ciphertext, body.vault.nonce, mek)).rejects.toThrow()

    // The keypair's private halves.
    expect(await openUnder(body.encrypted_private_key, newMEK)).toEqual(await openUnder(sealed.encrypted_private_key, mek))
    expect(await openUnder(body.encrypted_signing_key, newMEK)).toEqual(await openUnder(sealed.encrypted_signing_key, mek))

    // Each household key held as 'self', and nothing else.
    expect(body.households.map((h: { id: number }) => h.id)).toEqual([3])
    const reopened = await openKeyFromSelf(body.households[0].wrapped_key, newMEK)
    expect(await openName(await sealName('Home', householdKey), reopened)).toBe('Home')
    await expect(openKeyFromSelf(body.households[0].wrapped_key, mek)).rejects.toThrow()

    // The new password, as its auth key only.
    expect(body.new_auth_key).toBe(next.authKey)
    expect(JSON.stringify(body)).not.toContain('a new password')
  })
})

async function exported(key: CryptoKey): Promise<number[]> {
  return Array.from(new Uint8Array(await crypto.subtle.exportKey('raw', key)))
}
