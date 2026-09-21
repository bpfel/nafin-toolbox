import { describe, test, expect, vi, beforeEach } from 'vitest'
import type { VaultData } from '../crypto/vault'
import { TOUR_STEPS } from './steps'

const markDirty = vi.fn()

// The real store, with only the save stubbed. The tour writes to the vault
// through it, and what those writes are is most of what is worth asserting.
vi.mock('../crypto/vaultStore.svelte', async importOriginal => ({
  ...(await importOriginal<typeof import('../crypto/vaultStore.svelte')>()),
  markDirty: () => markDirty(),
}))

import { getVaultState } from '../crypto/vaultStore.svelte'
import {
  getTourState,
  startTour,
  moveTour,
  skipUnshowableStep,
  finishTour,
  abandonTour,
  declineTour,
  resetTour,
} from './tourStore.svelte'

const vaultState = getVaultState()
const tour = getTourState()

function emptyVault(): VaultData {
  return {
    version: 8,
    budget: { categories: [], entries: [], plan: [], snapshots: [] },
    accounts: [],
    tour: { completedAt: null, dismissedAt: null },
  }
}

beforeEach(() => {
  resetTour()
  markDirty.mockClear()
  vaultState.vault = emptyVault()
})

describe('walking the tour', () => {
  test('starts at the first step', () => {
    startTour()
    expect(tour.running).toBe(true)
    expect(tour.position).toBe(1)
    expect(tour.step?.id).toBe(TOUR_STEPS[0].id)
    expect(tour.atFirst).toBe(true)
  })

  test('nothing is a step until the tour is running', () => {
    expect(tour.running).toBe(false)
    expect(tour.step).toBeNull()
  })

  test('next and back move one step', () => {
    startTour()
    moveTour(1)
    expect(tour.position).toBe(2)
    moveTour(-1)
    expect(tour.position).toBe(1)
  })

  test('the counter reads one-based against the real total', () => {
    startTour()
    expect(tour.total).toBe(TOUR_STEPS.length)
    moveTour(1)
    expect(tour.position).toBe(2)
  })

  test('moving does nothing when the tour is not running', () => {
    moveTour(1)
    expect(tour.running).toBe(false)
    expect(vaultState.vault?.tour.completedAt).toBeNull()
  })
})

describe('what the vault is told', () => {
  test('walking off the end counts as having taken it', () => {
    startTour()
    for (let i = 0; i < TOUR_STEPS.length; i++) moveTour(1)

    expect(tour.running).toBe(false)
    expect(vaultState.vault?.tour.completedAt).not.toBeNull()
    expect(vaultState.vault?.tour.dismissedAt).toBeNull()
    expect(markDirty).toHaveBeenCalled()
  })

  test('skipping partway through does not', () => {
    startTour()
    moveTour(1)
    abandonTour()

    expect(tour.running).toBe(false)
    expect(vaultState.vault?.tour.completedAt).toBeNull()
    expect(vaultState.vault?.tour.dismissedAt).not.toBeNull()
  })

  /**
   * Back off the first step is a way out, not a finish. Recording it as a
   * completion would mean someone who opened the tour and immediately reversed
   * out of it is never offered it again, and is recorded as having seen
   * material they did not.
   */
  test('going back off the start is a dismissal, not a completion', () => {
    startTour()
    moveTour(-1)

    expect(tour.running).toBe(false)
    expect(vaultState.vault?.tour.completedAt).toBeNull()
    expect(vaultState.vault?.tour.dismissedAt).not.toBeNull()
  })

  test('turning the offer down records a dismissal without starting anything', () => {
    declineTour()

    expect(tour.running).toBe(false)
    expect(vaultState.vault?.tour.dismissedAt).not.toBeNull()
    expect(markDirty).toHaveBeenCalled()
  })

  /** Someone who has taken the tour has taken it, whatever they do later. */
  test('a later dismissal does not unset having completed it', () => {
    startTour()
    finishTour()
    const completedAt = vaultState.vault?.tour.completedAt
    declineTour()

    expect(vaultState.vault?.tour.completedAt).toBe(completedAt)
  })

  test('a locked vault is simply not written to', () => {
    vaultState.vault = null
    startTour()
    expect(() => abandonTour()).not.toThrow()
    expect(markDirty).not.toHaveBeenCalled()
  })
})

describe('a step with nothing to point at', () => {
  test('carries on forwards when the tour was going forwards', () => {
    startTour()
    moveTour(1)
    const before = tour.position
    skipUnshowableStep()
    expect(tour.position).toBe(before + 1)
  })

  /**
   * The case this rule exists for: skipping forward after Back would walk the
   * user into the step they just left, and they would never get past it.
   */
  test('carries on backwards when the tour was going backwards', () => {
    startTour()
    moveTour(1)
    moveTour(1)
    moveTour(-1)
    const before = tour.position
    skipUnshowableStep()
    expect(tour.position).toBe(before - 1)
  })

  test('a tour whose anchors are all missing walks off the end rather than spinning', () => {
    startTour()
    // One more than there are steps: if skipping could ever fail to advance,
    // this would not terminate at the end and `running` would still be true.
    for (let i = 0; i <= TOUR_STEPS.length; i++) {
      if (tour.running) skipUnshowableStep()
    }
    expect(tour.running).toBe(false)
  })
})
