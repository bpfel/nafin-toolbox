import { describe, test, expect, beforeEach, vi } from 'vitest'
import { createEmptyVault, type VaultData } from './vault'

// The real store, with only the network stubbed. The point of this file is the
// store's own behaviour, so mocking the store would leave nothing under test.
vi.mock('../api/client', () => ({
  fetchVaultKeys: vi.fn(),
  setupVaultKeys: vi.fn(),
  updateVaultKeys: vi.fn(),
  fetchVault: vi.fn(),
  putVault: vi.fn(async () => ({ updated_at: '2026-01-01T00:00:00Z' })),
  recoverVaultKeys: vi.fn(),
  VaultConflictError: class extends Error {},
}))

import { getVaultState, beginPreview, endPreview, markDirty } from './vaultStore.svelte'

const vaultState = getVaultState()

beforeEach(() => {
  vaultState.vault = createEmptyVault()
  endPreview()
})

/**
 * Preview mode: the store hands the screens a throwaway copy so the guided
 * tour can show an example budget without the user ending up with one.
 *
 * The guarantee is "it never wrote", not "it cleaned up afterwards" — an
 * interrupted tour cannot be relied on to clean anything, which is precisely
 * why seeding for real was abandoned.
 */
describe('previewing a vault', () => {
  test('puts a copy on screen and keeps the original aside', () => {
    const real = vaultState.vault as VaultData

    const started = beginPreview(copy => {
      copy.budget.categories.push({ id: 'c', name: 'Demo', side: 'expense', sortOrder: 1 })
    })

    expect(started).toBe(true)
    expect(vaultState.previewing).toBe(true)
    expect(vaultState.vault).not.toBe(real)
    expect(vaultState.vault!.budget.categories).toHaveLength(1)
    // The copy is deep: filling it must not reach through into the original.
    expect(real.budget.categories).toHaveLength(0)
  })

  test('puts the very same object back', () => {
    const real = vaultState.vault as VaultData

    beginPreview(() => {})
    endPreview()

    expect(vaultState.vault).toBe(real)
    expect(vaultState.previewing).toBe(false)
  })

  test('refuses to nest, so the original cannot be lost', () => {
    const real = vaultState.vault as VaultData

    beginPreview(() => {})
    const second = beginPreview(() => {})
    endPreview()

    expect(second).toBe(false)
    expect(vaultState.vault).toBe(real)
  })

  test('refuses when there is no vault to copy', () => {
    vaultState.vault = null

    expect(beginPreview(() => {})).toBe(false)
    expect(vaultState.previewing).toBe(false)
  })

  test('ending a preview that never started does nothing', () => {
    const real = vaultState.vault as VaultData

    endPreview()

    expect(vaultState.vault).toBe(real)
  })

  /**
   * The guard that matters. Without it the debounced autosave would encrypt
   * and persist the example a couple of seconds after it appeared, and the
   * user would own a budget they never typed.
   */
  test('a change to the copy is not treated as unsaved work', () => {
    beginPreview(copy => {
      copy.budget.categories.push({ id: 'c', name: 'Demo', side: 'expense', sortOrder: 1 })
    })

    markDirty()

    expect(vaultState.dirty).toBe(false)
  })

  test('and marking dirty works again once the preview is over', () => {
    beginPreview(() => {})
    endPreview()

    markDirty()

    expect(vaultState.dirty).toBe(true)
  })
})
