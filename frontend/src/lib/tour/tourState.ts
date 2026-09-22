import type { VaultData } from '../crypto/vault'

/**
 * What the vault remembers about the tour, as pure functions over it.
 *
 * Separated from the store so the rules can be tested without a vault store, a
 * DOM or a router — they are three one-line questions, and the cost of getting
 * one wrong is either nagging a user who already said no or never offering the
 * tour to anyone.
 */

/**
 * Whether the app should volunteer the tour.
 *
 * Both timestamps null, and only then. Finishing it and turning it down are
 * different answers to the same question, but they are the same answer to this
 * one: do not ask again.
 *
 * A null vault is a vault not yet unlocked, which is not the moment to offer
 * anything.
 */
export function shouldOfferTour(vault: VaultData | null): boolean {
  if (!vault) return false
  return vault.tour.completedAt === null && vault.tour.dismissedAt === null
}

/** Whether the user has been all the way through it at least once. */
export function hasTakenTour(vault: VaultData | null): boolean {
  return vault?.tour.completedAt != null
}

export function recordCompleted(vault: VaultData): void {
  vault.tour.completedAt = new Date().toISOString()
}

/**
 * Records a "not now".
 *
 * Deliberately does not clear `completedAt`: someone who has taken the tour and
 * later dismisses a re-offer has still taken it, and the Knowledge screen
 * should keep saying "again".
 */
export function recordDismissed(vault: VaultData): void {
  vault.tour.dismissedAt = new Date().toISOString()
}
