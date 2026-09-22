import { TOUR_STEPS, numbering, type TourStep } from './steps'
import { getVaultState, markDirty, beginPreview, endPreview } from '../crypto/vaultStore.svelte'
import { recordCompleted, recordDismissed } from './tourState'
import { resetBudget, seedDefaults } from '../budget/budgetEngine'
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
 * Shows the example budget the tour is written against.
 *
 * A **preview**: the vault store hands the screens a throwaway copy and puts
 * the original back when the tour ends. Nothing is written, nothing is saved,
 * and a tour abandoned halfway leaves no trace.
 *
 * Seeding for real and undoing afterwards was the first design and cannot be
 * made safe: the autosave would have persisted it within seconds, and an
 * interrupted tour — a closed tab, a reload — would strand the example in
 * someone's vault. A tutorial should not be able to give you a budget you did
 * not ask for.
 *
 * It replaces whatever is there, rather than only filling an empty budget,
 * and that is the second design. Only filling an empty one sounded kinder and
 * was worse in two ways. The step says in as many words that Swiss defaults
 * are being used for illustration, which was false for anyone who had a
 * budget of their own. And the five type steps ring one section each: a real
 * budget rarely holds all five, so those steps were skipped — not failing,
 * not explaining themselves, simply absent, and differently absent for
 * everybody.
 *
 * The copy is emptied before it is seeded because `seedDefaults` declines a
 * budget that already has entries, which is right everywhere else and would
 * here have left the user looking at their own figures under a caption saying
 * otherwise.
 */
function prepare(step: TourStep): void {
  if (!step.needsExampleBudget) return
  const vault = getVaultState().vault
  if (!vault) return

  const now = new Date()
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  beginPreview(copy => {
    resetBudget(copy)
    seedDefaults(copy, getLocale(), month)
  })
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
  // Before the vault is read, so what gets stamped is the user's own vault
  // and not the copy the tour was showing.
  endPreview()
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
  // Before the vault is read, so what gets stamped is the user's own vault
  // and not the copy the tour was showing.
  endPreview()
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
  endPreview()
  running = false
  index = 0
  direction = 1
}
