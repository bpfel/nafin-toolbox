import type { VaultData } from '../crypto/vault'
import { reapply, type Action, type RefusalCode } from './actions'

/**
 * The changes made to a vault that the server has not confirmed yet.
 *
 * Kept beside the vault on screen, which already has them applied. Their whole
 * use comes when a save is refused because somebody else saved first: the
 * newer vault is fetched, these are applied again on top of it (`replayAll`),
 * and the result is what is saved and shown. Two people changing different
 * things both keep their change, and nobody is asked to reload.
 *
 * In memory only. Kept on the device it would be the user's changes in
 * plaintext, outside the vault's encryption.
 */

/**
 * Add an action, folding it into the last one where that loses nothing.
 *
 * Typing an amount is one change to the user, not one per keystroke, and a
 * queue that kept every keystroke would replay a dozen of them to arrive where
 * the last one did.
 */
export function enqueue(queue: Action[], action: Action): Action[] {
  const last = queue.at(-1)
  if (
    last &&
    last.kind === 'setPlanned' &&
    action.kind === 'setPlanned' &&
    last.args[0] === action.args[0]
  ) {
    return [...queue.slice(0, -1), action]
  }
  return [...queue, action]
}

export interface Dropped {
  action: Action
  reason: RefusalCode
}

/**
 * Apply every queued action again, in order, onto a newer vault.
 *
 * An action that can no longer apply is dropped and reported, and the rest go
 * on without it: one change made impossible by somebody else is no reason to
 * lose the others. One whose effect is already there is skipped silently.
 */
export function replayAll(vault: VaultData, queue: Action[]): { vault: VaultData; dropped: Dropped[] } {
  let current = vault
  const dropped: Dropped[] = []
  for (const action of queue) {
    const { vault: next, verdict } = reapply(current, action)
    current = next
    if (verdict !== 'go' && verdict !== 'done') dropped.push({ action, reason: verdict })
  }
  return { vault: current, dropped }
}
