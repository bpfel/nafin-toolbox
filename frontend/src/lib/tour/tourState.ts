import type { VaultData } from '../crypto/vault'
import { nowISO } from '../sync/source'

/**
 * What the vault remembers about the tour, as pure functions over it.
 *
 * Separated from the store so the rules can be tested without a vault store, a
 * DOM or a router — they are three one-line questions, and the cost of getting
 * one wrong is either nagging a user who already said no or never offering the
 * tour to anyone.
 *
 * It remembers one thing and for one reason: whether the offer has been made.
 * Whether a walkthrough has been *taken* is deliberately not remembered at
 * all. Knowledge offers each of them with the same Start button however many
 * times they have been run, so there is nothing for such a fact to change —
 * and a "take it again" label only tells a returning user something they
 * already know, in exchange for a piece of state every screen has to be
 * careful about.
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
 *
 * Only ever asked about the first walkthrough — the shared-budgets one is not
 * volunteered at all, because it describes an arrangement most people do not
 * have and offering it to everybody would be the app guessing at a household.
 * That is why nothing here takes a tour id: there is one offer to remember.
 */
export function shouldOfferTour(vault: VaultData | null): boolean {
  if (!vault) return false
  return vault.tour.completedAt === null && vault.tour.dismissedAt === null
}

export function recordCompleted(vault: VaultData): void {
  vault.tour.completedAt = nowISO()
}

/**
 * Records a "not now".
 *
 * Deliberately does not clear `completedAt`: both answers close the offer, and
 * overwriting one with the other would lose which was given.
 */
export function recordDismissed(vault: VaultData): void {
  vault.tour.dismissedAt = nowISO()
}
