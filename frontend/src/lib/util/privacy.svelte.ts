// Hiding the figures from whoever is standing behind you.
//
// **This is not the vault lock, and nothing here should suggest it is.** The
// lock is cryptographic: without the password the data is unreadable by anyone,
// including the server. This defeats exactly one thing — a person glancing at
// your screen on a train. The amounts are still in the page, still in memory,
// still one devtools panel away. Every string this feature shows says "hide"
// and "show", never "lock" or "protect", so nobody mistakes one for the other.
//
// Blur rather than dots or dashes, because nothing reflows: the page you were
// reading is the page you are looking at, and turning it off does not scroll
// you somewhere else. `user-select: none` goes with it so a blurred figure
// cannot simply be dragged out as text.

const STORAGE_KEY = 'nafin.hideAmounts'

/**
 * localStorage is not merely empty in some browsers — it throws. Safari private
 * browsing, a full quota, and cookies blocked entirely all raise on access. This
 * runs at import time, so an uncaught throw would take the app down before it
 * renders anything.
 *
 * Losing the preference shows the figures, which is the pre-existing behaviour
 * and the one a user can see and correct. Failing closed would be a blurred app
 * with a toggle that never sticks.
 */
function load(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

function save(value: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(value))
  } catch {
    // The setting still holds for this tab; it just will not outlive it.
  }
}

let hiding = $state(load())
let peeking = $state(false)

/**
 * Whether a figure should be blurred *right now* — the setting, unless the user
 * is holding the control down to look.
 */
export function amountsHidden(): boolean {
  return hiding && !peeking
}

/**
 * Whether hiding is switched on, regardless of a peek in progress.
 *
 * The eye reads this rather than `amountsHidden()`: its icon says what the
 * setting is, and flipping back and forth under the thumb that is holding it
 * would be a control arguing with itself.
 */
export function hidingAmounts(): boolean {
  return hiding
}

export function toggleHidingAmounts(): void {
  hiding = !hiding
  peeking = false
  save(hiding)
}

/**
 * Reveal while held. Checking one figure is the common case, and it should not
 * cost two taps and a re-blur that the user has to remember.
 */
export function beginPeek(): void {
  if (hiding) peeking = true
}

export function endPeek(): void {
  peeking = false
}

/**
 * Deliberately *not* called on logout.
 *
 * This is a property of the device, not of the account: you turn it on because
 * of where you use this laptop, and that is still true after you sign out and
 * back in. Clearing it would mean re-arming it every session, which is how a
 * safety feature gets abandoned. Exported for tests, which need a known state.
 */
export function resetHidingAmounts(): void {
  hiding = false
  peeking = false
  save(false)
}
