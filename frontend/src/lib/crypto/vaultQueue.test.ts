import { describe, test, expect, beforeEach, vi } from 'vitest'

// The real store and the real crypto, with only the network stubbed — as in
// `vaultSwitching.test.ts`, whose harness this follows.
vi.mock('../api/client', () => ({
  fetchVaultKeys: vi.fn(async () => ({ encrypted_mek: '', iterations: 600000 })),
  setupVaultKeys: vi.fn(),
  setupIdentity: vi.fn(),
  updateVaultKeys: vi.fn(),
  fetchVault: vi.fn(async () => null),
  putVault: vi.fn(async () => ({ updated_at: '2026-01-01T00:00:00Z' })),
  recoverVaultKeys: vi.fn(),
  VaultConflictError: class extends Error {},
  VaultReadOnlyError: class extends Error {},
  fetchHouseholds: vi.fn(async () => []),
  fetchHouseholdVault: vi.fn(async () => null),
  putHouseholdVault: vi.fn(),
  fetchHouseholdMembers: vi.fn(async () => []),
  fetchHouseholdInvites: vi.fn(async () => []),
}))

import * as client from '../api/client'
const api = client as unknown as Record<string, ReturnType<typeof vi.fn>>

import {
  getVaultState, tryRestoreVault, clearVault, commit, saveVault, beginPreview, endPreview,
} from './vaultStore.svelte'

const state = getVaultState()

async function signIn(): Promise<void> {
  const mek = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
  const raw = await crypto.subtle.exportKey('raw', mek)
  sessionStorage.setItem('vault_mek', btoa(String.fromCharCode(...new Uint8Array(raw))))
  await tryRestoreVault(42)
}

/**
 * A save the test lets through when it chooses.
 *
 * The request goes out only after the vault is encrypted, so `release` first
 * waits for it to have gone — releasing a request not yet made would let
 * nothing through.
 */
function holdNextSave(): () => Promise<void> {
  let resolve: ((v: { updated_at: string }) => void) | null = null
  api.putVault.mockImplementationOnce(() => new Promise(r => { resolve = r }))
  return async () => {
    await vi.waitFor(() => expect(resolve).not.toBeNull())
    resolve!({ updated_at: '2026-01-02T00:00:00Z' })
  }
}

beforeEach(async () => {
  endPreview()
  clearVault()
  vi.clearAllMocks()
  api.fetchVault.mockResolvedValue(null)
  api.putVault.mockResolvedValue({ updated_at: '2026-01-01T00:00:00Z' })
  await signIn()
})

describe('commit', () => {
  test('applies the change on screen and leaves it to be saved', () => {
    const created = commit('createAccount', { name: 'Savings' })
    expect(state.vault!.accounts.map(a => a.name)).toContain('Savings')
    expect(created.name).toBe('Savings')
    expect(state.dirty).toBe(true)
  })

  test('is settled by a save that carries it', async () => {
    commit('createAccount', { name: 'Savings' })
    await saveVault()
    expect(state.dirty).toBe(false)
  })

  test('a change made while a save is in flight is still waiting afterwards', async () => {
    const id = state.vault!.accounts[0].id
    commit('correctBalance', id, '100.00', '2026-01-01')

    const release = holdNextSave()
    const saving = saveVault()
    commit('correctBalance', id, '200.00', '2026-01-01')
    await release()
    await saving

    expect(state.dirty).toBe(true)
  })

  test('an amount retyped while a save is in flight is not cleared with it', async () => {
    commit('createEntry', { name: 'Rent', type: 'expense', categoryName: 'Housing' })
    const rent = state.vault!.budget.entries[0].id
    commit('setPlanned', rent, '1')

    const release = holdNextSave()
    const saving = saveVault()
    // Folds into the queued '1' — which the save in flight is carrying.
    commit('setPlanned', rent, '12')
    await release()
    await saving

    expect(state.dirty).toBe(true)
  })

  test('a change the engine refuses is thrown, and nothing is left to save', () => {
    const only = state.vault!.accounts[0].id
    expect(() => commit('deleteAccount', only, only)).toThrow()
    expect(state.dirty).toBe(false)
  })

  test('a change to a preview shows, and is never saved', () => {
    beginPreview(() => {})
    commit('createAccount', { name: 'Example' })
    expect(state.vault!.accounts.map(a => a.name)).toContain('Example')
    expect(state.dirty).toBe(false)
    endPreview()
    expect(state.vault!.accounts.map(a => a.name)).not.toContain('Example')
  })
})
