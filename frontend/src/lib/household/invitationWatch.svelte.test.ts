import { describe, test, expect, vi } from 'vitest'

const store = vi.hoisted(() => ({ calls: 0 }))

vi.mock('../crypto/vaultStore.svelte', () => ({
  getVaultState: () => ({ households: [{ id: 3, name: 'Flat', role: 'owner' }] }),
  loadInvites: vi.fn(async () => {
    store.calls++
    return [{ id: 7, accepted_at: '2026-10-17T10:00:00Z', verified: true }]
  }),
}))

import { getInvitationState, startInvitationWatch } from './invitations.svelte'

const settle = () => new Promise(r => setTimeout(r, 50))

/**
 * Found by hand: started from an effect, the watch tracked what its first
 * sweep read, so recording the answer re-ran the effect, which tore the watch
 * down and swept again — tens of thousands of requests, and a dot that was
 * cleared as often as it was set.
 */
describe('the invitation watch, started from an effect', () => {
  test('sweeps once, and the dot stays', async () => {
    const unlocked = $state({ value: true })
    const cleanup = $effect.root(() => {
      $effect(() => {
        if (unlocked.value) return startInvitationWatch()
      })
    })

    await settle()
    await settle()

    expect(store.calls).toBe(1)
    expect(getInvitationState().anyWaiting).toBe(true)
    cleanup()
  })
})
