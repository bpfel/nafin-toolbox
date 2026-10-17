import { getVaultState, loadInvites, type PendingInvite } from '../crypto/vaultStore.svelte'

/**
 * Who is waiting for an owner to let them in, and keeping that current.
 *
 * Accepting an invitation grants nothing: the owner's device has to wrap the
 * household key for the newcomer, and since that is now a button rather than
 * something done behind the owner's back, the owner has to *learn* that
 * somebody is waiting. This is what tells them — the dot on Profile, in the
 * household switcher and on the household's row.
 *
 * It asks the server only about households this account owns that have an
 * invitation outstanding: once on unlock to find out which those are, then
 * every minute and on coming back to the tab. No outstanding invitation, no
 * requests. The People panel asks far more often while it is open; what it
 * finds is recorded here too, so the dot and the panel never disagree.
 */

const SWEEP_MS = 60 * 1000

/** Accepted invitations waiting for Confirm, by household. */
let waiting = $state<Record<number, number>>({})

/** Households with any invitation not yet confirmed — the ones worth asking about. */
const outstanding = new Set<number>()

export function getInvitationState() {
  return {
    /** How many are waiting in this household. */
    waitingIn(householdId: number): number {
      return waiting[householdId] ?? 0
    },
    /** Whether anybody is waiting anywhere: the dot on Profile. */
    get anyWaiting(): boolean {
      return Object.values(waiting).some(n => n > 0)
    },
  }
}

/** What the People panel (or a sweep) just read for one household. */
export function recordInvites(householdId: number, invites: PendingInvite[]): void {
  if (invites.length > 0) outstanding.add(householdId)
  else outstanding.delete(householdId)

  const accepted = invites.filter(i => i.accepted_at).length
  if ((waiting[householdId] ?? 0) !== accepted) waiting = { ...waiting, [householdId]: accepted }
}

/** A new invitation, so the household is worth asking about from now on. */
export function noteInvited(householdId: number): void {
  outstanding.add(householdId)
}

async function check(householdId: number): Promise<void> {
  try {
    recordInvites(householdId, await loadInvites(householdId))
  } catch {
    // Next sweep.
  }
}

function owned(): number[] {
  return getVaultState().households.filter(h => h.role === 'owner').map(h => h.id)
}

/** Ask about every household that might have somebody waiting. */
export async function sweep(all = false): Promise<void> {
  const mine = new Set(owned())
  // A household no longer owned — left, deleted, handed over — has nobody this
  // account can let in.
  for (const id of [...outstanding]) if (!mine.has(id)) outstanding.delete(id)
  for (const id of Object.keys(waiting).map(Number)) {
    if (!mine.has(id)) waiting = Object.fromEntries(Object.entries(waiting).filter(([k]) => Number(k) !== id))
  }
  const ids = all ? [...mine] : [...outstanding]
  await Promise.all(ids.map(check))
}

/**
 * Begin watching. Called once the vault is unlocked; returns a teardown, which
 * also forgets everything, since the next account to sign in is not this one.
 */
export function startInvitationWatch(): () => void {
  void sweep(true)

  const timer = setInterval(() => {
    if (document.visibilityState === 'visible') void sweep()
  }, SWEEP_MS)
  const onVisible = () => {
    if (document.visibilityState === 'visible') void sweep()
  }
  document.addEventListener('visibilitychange', onVisible)

  return () => {
    clearInterval(timer)
    document.removeEventListener('visibilitychange', onVisible)
    outstanding.clear()
    waiting = {}
  }
}
