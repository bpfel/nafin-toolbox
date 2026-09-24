import type { VaultData, TourProgress } from '../crypto/vault'
import type { TourId } from './steps'

/**
 * What the vault remembers about the tours, as pure functions over it.
 *
 * Separated from the store so the rules can be tested without a vault store, a
 * DOM or a router — they are three one-line questions, and the cost of getting
 * one wrong is either nagging a user who already said no or never offering the
 * tour to anyone.
 *
 * Two tours, one shape. `basics` keeps the two timestamps at the top of
 * `vault.tour`, where it has always kept them; `shared` keeps its own pair
 * under `tour.shared`. Reading through one accessor is what stops the second
 * tour growing a parallel set of these functions that drift from the first.
 */

const NEVER: TourProgress = { completedAt: null, dismissedAt: null }

/**
 * Where a tour keeps its two timestamps.
 *
 * Read-only: `tour.shared` is optional, so a vault that has never reached the
 * second tour has nothing there and gets `NEVER` instead. Writing goes through
 * `progressFor` below, which creates it.
 */
function progressOf(vault: VaultData, tour: TourId): TourProgress {
  return tour === 'basics' ? vault.tour : (vault.tour.shared ?? NEVER)
}

/** The same, for writing — which means `tour.shared` has to exist by the end. */
function progressFor(vault: VaultData, tour: TourId): TourProgress {
  if (tour === 'basics') return vault.tour
  // Assigned rather than mutated in place when absent, so the caller's
  // subsequent write lands on something the vault actually holds.
  vault.tour.shared ??= { completedAt: null, dismissedAt: null }
  return vault.tour.shared
}

/**
 * Whether the app should volunteer the tour.
 *
 * Both timestamps null, and only then. Finishing it and turning it down are
 * different answers to the same question, but they are the same answer to this
 * one: do not ask again.
 *
 * A null vault is a vault not yet unlocked, which is not the moment to offer
 * anything.
 *
 * Only ever asked about `basics`. The shared-budgets walkthrough is not
 * volunteered at all — it describes an arrangement most people do not have,
 * and offering it to everybody would be the app guessing at a household.
 */
export function shouldOfferTour(vault: VaultData | null): boolean {
  if (!vault) return false
  return vault.tour.completedAt === null && vault.tour.dismissedAt === null
}

/** Whether the user has been all the way through it at least once. */
export function hasTakenTour(vault: VaultData | null, tour: TourId = 'basics'): boolean {
  if (!vault) return false
  return progressOf(vault, tour).completedAt != null
}

export function recordCompleted(vault: VaultData, tour: TourId = 'basics'): void {
  progressFor(vault, tour).completedAt = new Date().toISOString()
}

/**
 * Records a "not now".
 *
 * Deliberately does not clear `completedAt`: someone who has taken the tour and
 * later dismisses a re-offer has still taken it, and the Knowledge screen
 * should keep saying "again".
 */
export function recordDismissed(vault: VaultData, tour: TourId = 'basics'): void {
  progressFor(vault, tour).dismissedAt = new Date().toISOString()
}
