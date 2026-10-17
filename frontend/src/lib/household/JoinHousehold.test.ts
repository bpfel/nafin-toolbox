import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/svelte'

const arrived = vi.hoisted(() => ({ value: false }))

vi.mock('../crypto/vaultStore.svelte', () => ({
  getVaultState: () => ({ unlocked: true }),
  acceptInvite: vi.fn(async () => 3),
  householdArrived: vi.fn(async () => arrived.value),
  switchTo: vi.fn(async () => {}),
}))

vi.mock('../nav/router.svelte', () => ({ navigate: vi.fn() }))

import { householdArrived, switchTo } from '../crypto/vaultStore.svelte'
import { navigate } from '../nav/router.svelte'
import JoinHousehold from './JoinHousehold.svelte'

const settle = () => new Promise(r => setTimeout(r, 20))

/**
 * Accepting grants nothing; the owner confirms. The person who accepted waits
 * on this screen, and it opens the household when the confirmation lands.
 */
describe('waiting to be let in', () => {
  beforeEach(() => {
    cleanup()
    arrived.value = false
    vi.mocked(householdArrived).mockClear()
    vi.mocked(switchTo).mockClear()
    vi.mocked(navigate).mockClear()
    window.history.replaceState(null, '', '/join#t=token&s=c2VjcmV0')
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
  })

  afterEach(() => vi.useRealTimers())

  test('says who still has to act, then opens the household once they have', async () => {
    render(JoinHousehold)
    await settle()
    expect(screen.getByText(/still has to confirm you/i)).toBeTruthy()

    await vi.advanceTimersByTimeAsync(4000)
    expect(householdArrived).toHaveBeenCalledWith(3)
    expect(switchTo).not.toHaveBeenCalled()

    arrived.value = true
    await vi.advanceTimersByTimeAsync(4000)
    await settle()

    expect(switchTo).toHaveBeenCalledWith(3)
    expect(navigate).toHaveBeenCalledWith('/budget')
  })

  test('stops asking once the screen is left', async () => {
    const { unmount } = render(JoinHousehold)
    await settle()
    unmount()

    await vi.advanceTimersByTimeAsync(20_000)

    expect(householdArrived).not.toHaveBeenCalled()
  })
})
