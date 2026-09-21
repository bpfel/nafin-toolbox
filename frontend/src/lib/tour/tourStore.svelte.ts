import { TOUR_STEPS, numbering, type TourStep } from './steps'
import { getVaultState, markDirty } from '../crypto/vaultStore.svelte'
import { recordCompleted, recordDismissed } from './tourState'
import { seedDefaults } from '../budget/budgetEngine'
import { getLocale } from '../i18n/index.svelte'

/**
 * Where the tour is, if it is running.
 *
 * Only the position lives here. *What* to highlight is in `steps.ts`, *how* to
 * highlight it is in `TourOverlay.svelte`, and whether the tour has ever been
 * taken is in the vault via `tourState.ts`. Keeping the position on its own is
 * what lets the overlay be the only part that touches the DOM.
 */
let index = $state(0)
let running = $state(false)

/**
 * Which way the tour was last moving.
 *
 * Needed because a step can turn out to be unshowable — its anchor is not in
 * the document — and the right response is to carry on the way the user was
 * already going. Skipping forward when they pressed Back would walk them into
 * the step they just left.
 */
let direction = $state<1 | -1>(1)

export function getTourState() {
  return {
    get running() {
      return running
    },
    get index() {
      return index
    },
    get step(): TourStep | null {
      return running ? (TOUR_STEPS[index] ?? null) : null
    },
    /** What the counter shows: "4", or "5.2" inside a group. See `numbering`. */
    get position() {
      return numbering()[index]?.label ?? String(index + 1)
    },
    /** Topics, not steps — five of them are parts of one. */
    get total() {
      return numbering()[index]?.total ?? TOUR_STEPS.length
    },
    get atFirst() {
      return index === 0
    },
    get atLast() {
      return index === TOUR_STEPS.length - 1
    },
  }
}

/**
 * Fills an empty budget with the Swiss defaults, if this step needs rows.
 *
 * The five type steps point at real sections of the budget table, and an
 * empty budget has none — so the tour puts something there rather than
 * highlighting nothing. The defaults are the same ones the empty budget
 * screen offers behind its own button, so this is the app doing what the user
 * could have done a moment earlier, not a second way of seeding.
 *
 * Two guards, both load-bearing. It never runs on a budget that already has
 * entries, so nobody's own figures are touched. And it is announced in the
 * step's own words rather than happening quietly, because writing to someone's
 * vault as a side effect of reading a tutorial is exactly the kind of thing
 * that should not be a surprise.
 */
function prepare(step: TourStep): void {
  if (!step.needsExampleBudget) return
  const vault = getVaultState().vault
  if (!vault || vault.budget.entries.length > 0) return

  const now = new Date()
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  seedDefaults(vault, getLocale(), month)
  markDirty()
}

export function startTour(): void {
  index = 0
  direction = 1
  running = true
  prepare(TOUR_STEPS[0])
}

/**
 * Moves one step, in the direction given, and finishes if that runs off an end.
 *
 * Off the *end* counts as having taken the tour; off the *start* does not —
 * pressing Back on the first step is a way out, not a completion, and stamping
 * it as one would stop the app ever offering the tour to someone who never saw
 * it.
 */
export function moveTour(delta: 1 | -1): void {
  if (!running) return
  direction = delta
  const next = index + delta
  if (next >= TOUR_STEPS.length) {
    finishTour()
    return
  }
  if (next < 0) {
    abandonTour()
    return
  }
  index = next
  prepare(TOUR_STEPS[next])
}

/**
 * Called by the overlay when the current step has nothing to point at.
 *
 * Carries on whichever way the tour was going. This terminates: the index only
 * ever moves one way per call and the ends are handled above, so a tour whose
 * anchors are all missing walks off the end rather than spinning.
 */
export function skipUnshowableStep(): void {
  moveTour(direction)
}

/** Reached the end. Records it, so the offer is not made again. */
export function finishTour(): void {
  running = false
  const vault = getVaultState().vault
  if (vault) {
    recordCompleted(vault)
    markDirty()
  }
}

/**
 * Left partway through — Skip, Escape, or Back off the first step.
 *
 * Recorded as dismissed rather than completed. The distinction is what lets
 * Knowledge offer the tour rather than offer it *again*, and it keeps the app
 * from claiming someone has seen material they walked out of.
 */
export function abandonTour(): void {
  running = false
  const vault = getVaultState().vault
  if (vault) {
    recordDismissed(vault)
    markDirty()
  }
}

/** Turned down without being started. */
export function declineTour(): void {
  const vault = getVaultState().vault
  if (vault) {
    recordDismissed(vault)
    markDirty()
  }
}

/** Test seam, and the logout path: forget where we were without recording it. */
export function resetTour(): void {
  running = false
  index = 0
  direction = 1
}
