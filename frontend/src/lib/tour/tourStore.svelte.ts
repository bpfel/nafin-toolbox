import { TOUR_STEPS, type TourStep } from './steps'
import { getVaultState, markDirty } from '../crypto/vaultStore.svelte'
import { recordCompleted, recordDismissed } from './tourState'

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
    /** 1-based, for "3 of 9". */
    get position() {
      return index + 1
    },
    get total() {
      return TOUR_STEPS.length
    },
    get atFirst() {
      return index === 0
    },
    get atLast() {
      return index === TOUR_STEPS.length - 1
    },
  }
}

export function startTour(): void {
  index = 0
  direction = 1
  running = true
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
