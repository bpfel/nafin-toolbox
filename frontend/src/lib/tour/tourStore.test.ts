import { describe, test, expect, vi, beforeEach } from 'vitest'
import type { VaultData } from '../crypto/vault'
import { TOUR_STEPS, SHARED_STEPS } from './steps'

const markDirty = vi.fn()

// The real store, with only the save stubbed. The tour writes to the vault
// through it, and what those writes are is most of what is worth asserting.
vi.mock('../crypto/vaultStore.svelte', async importOriginal => ({
  ...(await importOriginal<typeof import('../crypto/vaultStore.svelte')>()),
  markDirty: () => markDirty(),
}))

import { getVaultState } from '../crypto/vaultStore.svelte'
import { numbering } from './steps'
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

/**
 * An empty vault that still keeps the vault's own invariant: at least one
 * account, so every entry can be routed from the moment it is created.
 *
 * It said `accounts: []` until the tour started seeding an example budget,
 * at which point the fixture was the only vault in the codebase that could
 * not have existed — `createEmptyVault` has always made one.
 */
function emptyVault(): VaultData {
  return {
    version: 9,
    trust: { pins: {}, epochs: {} },
    budget: { categories: [], entries: [], plan: [], snapshots: [] },
    accounts: [
      {
        id: 'acc-main',
        name: 'Main',
        kind: 'transactional',
        currency: 'CHF',
        currentAmount: '0.00',
        lastCorrectedAt: '2026-01-01',
      },
    ],
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
    startTour('basics')
    expect(tour.running).toBe(true)
    expect(tour.position).toBe('1')
    expect(tour.step?.id).toBe(TOUR_STEPS[0].id)
    expect(tour.atFirst).toBe(true)
  })

  test('nothing is a step until the tour is running', () => {
    expect(tour.running).toBe(false)
    expect(tour.step).toBeNull()
  })

  test('next and back move one step', () => {
    startTour('basics')
    moveTour(1)
    expect(tour.index).toBe(1)
    moveTour(-1)
    expect(tour.index).toBe(0)
  })

  /**
   * The counter names topics, not steps: five of them are parts of one, so a
   * tour of thirteen steps reads as eight. See `numbering`.
   */
  test('the counter reads against topics rather than steps', () => {
    startTour('basics')
    const topics = numbering().at(-1)!.total

    expect(tour.total).toBe(topics)
    expect(topics).toBeLessThan(TOUR_STEPS.length)
    expect(tour.position).toBe('1')
  })

  test('a sub-step is numbered under the step it belongs to', () => {
    const first = TOUR_STEPS.findIndex(s => s.sub)
    expect(first, 'no sub-steps to check').toBeGreaterThan(0)

    startTour('basics')
    for (let i = 0; i < first; i++) moveTour(1)

    expect(tour.position).toBe(`${numbering()[first - 1].label}.1`)
  })

  test('moving does nothing when the tour is not running', () => {
    moveTour(1)
    expect(tour.running).toBe(false)
    expect(vaultState.vault?.tour.completedAt).toBeNull()
  })
})

describe('what the vault is told', () => {
  test('walking off the end counts as having taken it', () => {
    startTour('basics')
    for (let i = 0; i < TOUR_STEPS.length; i++) moveTour(1)

    expect(tour.running).toBe(false)
    expect(vaultState.vault?.tour.completedAt).not.toBeNull()
    expect(vaultState.vault?.tour.dismissedAt).toBeNull()
    expect(markDirty).toHaveBeenCalled()
  })

  test('skipping partway through does not', () => {
    startTour('basics')
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
    startTour('basics')
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
    startTour('basics')
    finishTour()
    const completedAt = vaultState.vault?.tour.completedAt
    declineTour()

    expect(vaultState.vault?.tour.completedAt).toBe(completedAt)
  })

  test('a locked vault is simply not written to', () => {
    vaultState.vault = null
    startTour('basics')
    expect(() => abandonTour()).not.toThrow()
    expect(markDirty).not.toHaveBeenCalled()
  })
})

/**
 * The second walkthrough, which exists to prove the machinery is a machine.
 *
 * Only what is different is asserted here. Everything above — the counter, the
 * skipping, the preview never being written — is the same code reading a
 * different array, and restating it per tour would mean every future tour owes
 * this file a copy of itself.
 */
describe('the shared-budgets walkthrough', () => {
  test('walks its own steps, not the first tour’s', () => {
    startTour('shared')

    expect(tour.tour).toBe('shared')
    expect(tour.step?.id).toBe(SHARED_STEPS[0].id)
    expect(TOUR_STEPS.map(s => s.id)).not.toContain(tour.step!.id)
  })

  test('shows the household example rather than the personal one', () => {
    startTour('shared')
    while (tour.running && !tour.step?.example) moveTour(1)

    const shown = vaultState.vault!
    // Two income lines is the tell: the personal starter has exactly one, and
    // the whole point of the household example is that income arrives as two
    // people's contributions.
    expect(shown.budget.entries.filter(e => e.type === 'income')).toHaveLength(2)
    // And no per-person lines: insurance and 3a stay in the personal plan,
    // which is what the step standing here says out loud.
    expect(shown.budget.entries.map(e => e.name)).not.toContain('Pillar 3a')
  })

  /**
   * Nothing is written down about it, at either end.
   *
   * The vault remembers one thing — whether the offer has been made — and only
   * the first tour is ever offered. Recording this one against those same two
   * timestamps would close an offer the reader never saw, and there is no
   * second pair to record it in because nothing would read one: Knowledge
   * offers every walkthrough with the same Start button, however many times it
   * has been run.
   */
  test('finishing it writes nothing to the vault', () => {
    startTour('shared')
    for (let i = 0; i < SHARED_STEPS.length; i++) moveTour(1)

    expect(tour.running).toBe(false)
    expect(vaultState.vault?.tour.completedAt).toBeNull()
    expect(vaultState.vault?.tour.dismissedAt).toBeNull()
    expect(markDirty).not.toHaveBeenCalled()
  })

  test('abandoning it writes nothing either', () => {
    startTour('shared')
    moveTour(1)
    abandonTour()

    expect(vaultState.vault?.tour.dismissedAt).toBeNull()
    expect(markDirty).not.toHaveBeenCalled()
  })

  test('the first tour is still recorded', () => {
    startTour('basics')
    for (let i = 0; i < TOUR_STEPS.length; i++) moveTour(1)

    expect(vaultState.vault?.tour.completedAt).not.toBeNull()
  })
})

describe('a step with nothing to point at', () => {
  test('carries on forwards when the tour was going forwards', () => {
    startTour('basics')
    moveTour(1)
    const before = tour.index
    skipUnshowableStep()
    expect(tour.index).toBe(before + 1)
  })

  /**
   * The case this rule exists for: skipping forward after Back would walk the
   * user into the step they just left, and they would never get past it.
   */
  test('carries on backwards when the tour was going backwards', () => {
    startTour('basics')
    moveTour(1)
    moveTour(1)
    moveTour(-1)
    const before = tour.index
    skipUnshowableStep()
    expect(tour.index).toBe(before - 1)
  })

  test('a tour whose anchors are all missing walks off the end rather than spinning', () => {
    startTour('basics')
    // One more than there are steps: if skipping could ever fail to advance,
    // this would not terminate at the end and `running` would still be true.
    for (let i = 0; i <= TOUR_STEPS.length; i++) {
      if (tour.running) skipUnshowableStep()
    }
    expect(tour.running).toBe(false)
  })
})

/**
 * The promise the tour makes about the user's data: it shows an example
 * budget and gives nothing back.
 *
 * This replaced seeding for real. Seeding could not be made safe — the
 * autosave persists within seconds, and a tour abandoned by closing the tab
 * would strand the example in someone's vault — so the guarantee worth
 * testing is not "it cleans up" but "it never wrote".
 */
describe('the example budget is only on loan', () => {
  /** Walks a tour forward until the step that asks for an example budget. */
  function reachExample(which: 'basics' | 'shared' = 'basics'): void {
    startTour(which)
    while (tour.running && !tour.step?.example) moveTour(1)
    expect(tour.step?.example, 'no step asks for an example').toBeDefined()
  }

  test('the example appears while the tour is on it', () => {
    reachExample()

    const shown = vaultState.vault!
    expect(shown.budget.entries.length).toBeGreaterThan(0)
    // All five, or the type steps after this one have nothing to ring.
    expect(new Set(shown.budget.entries.map(e => e.type)).size).toBe(5)
    expect(vaultState.previewing).toBe(true)
  })

  test('the real vault is untouched underneath it', () => {
    const real = vaultState.vault!
    reachExample()

    expect(vaultState.vault).not.toBe(real)
    expect(real.budget.entries).toHaveLength(0)
  })

  test('it is gone when the tour finishes', () => {
    const real = vaultState.vault!
    reachExample()
    while (tour.running) moveTour(1)

    expect(vaultState.vault).toBe(real)
    expect(vaultState.vault!.budget.entries).toHaveLength(0)
    expect(vaultState.previewing).toBe(false)
  })

  test('it is gone when the tour is abandoned halfway', () => {
    const real = vaultState.vault!
    reachExample()
    abandonTour()

    expect(vaultState.vault).toBe(real)
    expect(vaultState.vault!.budget.entries).toHaveLength(0)
  })

  test('it is gone when the tour is simply forgotten', () => {
    // Logging out goes through here, and must not leave the next session
    // looking at the last one's example.
    const real = vaultState.vault!
    reachExample()
    resetTour()

    expect(vaultState.vault).toBe(real)
  })

  /**
   * That the *tour* never asks for a save. Whether the store would refuse one
   * anyway is its own question, tested against the real store in
   * `crypto/vaultPreview.test.ts` — `markDirty` is stubbed in this file, so
   * asserting the guard here would only be asserting the stub.
   */
  test('the tour never marks the vault as needing saving', () => {
    reachExample()

    expect(markDirty).not.toHaveBeenCalled()
  })

  /**
   * A budget of the user's own is shown the example too, and gets it back
   * untouched afterwards.
   *
   * It used to be left alone, which read as the kinder choice and was not:
   * the step says Swiss defaults are being used for illustration, and the
   * five type steps ring one section each. A real budget rarely holds all
   * five, so those steps quietly vanished — a different tour for everybody,
   * and no way to tell that anything was missing.
   */
  test('a budget of the user’s own is replaced for the tour, and restored after', () => {
    const vault = vaultState.vault!
    vault.budget.categories.push({ id: 'c1', name: 'Housing', side: 'expense', sortOrder: 10 })
    vault.budget.entries.push({
      id: 'e1',
      name: 'Rent',
      type: 'expense',
      sortOrder: 10,
      archived: false,
      categoryId: 'c1',
      sourceAccountId: 'acc-main',
      sinkAccountId: null,
    })

    reachExample()

    expect(vaultState.previewing).toBe(true)
    expect(vaultState.vault).not.toBe(vault)
    // All five, so no type step is skipped for want of a section.
    expect(new Set(vaultState.vault!.budget.entries.map(e => e.type)).size).toBe(5)
    // By id, not by name: the Swiss defaults have a Rent of their own, which
    // is exactly the confusion this assertion is here to avoid.
    expect(vaultState.vault!.budget.entries.find(e => e.id === 'e1')).toBeUndefined()

    abandonTour()

    expect(vaultState.vault).toBe(vault)
    expect(vaultState.vault!.budget.entries).toHaveLength(1)
    expect(vaultState.vault!.budget.entries[0].id).toBe('e1')
  })
})
