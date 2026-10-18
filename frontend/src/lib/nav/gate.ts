/**
 * Which screen stands between the user and the app, if any.
 *
 * There are eleven of them — a browser that cannot encrypt, signing in, verifying an address, a forced password
 * change, an enforced 2FA setup, four vault states and the lock screen. Each is
 * a centred card with no navigation, because navigating away from any of them
 * would be meaningless.
 *
 * This used to be an `{#if}/{:else if}` cascade in App.svelte *plus* a
 * twelve-term boolean beside it that mirrored the cascade by hand, so the
 * language picker would know it had no bar to sit in. Two statements of one
 * truth, kept in agreement by whoever remembered. Adding an eleventh gate meant
 * remembering to add a term a hundred and forty lines away, and forgetting was
 * silent: the picker simply vanished on that screen.
 *
 * One function instead, for three things the pair could not do:
 *
 * - **They can no longer disagree.** The cascade renders `gateFor(...)` and the
 *   flag is `gateFor(...) !== null`.
 * - **Precedence is a decision rather than an accident of what was written
 *   first.** A forced password change outranks an enforced 2FA setup because
 *   the line below says so, not because it happened to be typed higher up.
 * - **It can be tested.** It is a pure function of state, so every combination
 *   that matters can be asserted without rendering anything.
 */
export type Gate =
  | 'insecure'
  | 'loading'
  | 'verify'
  | 'login'
  | 'mustChangePassword'
  | 'enforce2FA'
  | 'recoveryKey'
  | 'vaultAhead'
  | 'vaultSetup'
  | 'vaultDecryptFailed'
  | 'vaultLocked'

export interface GateState {
  /**
   * The browser offers the Web Crypto API. It does only on HTTPS or localhost;
   * over plain HTTP the vault cannot be opened at all.
   */
  canEncrypt: boolean
  /** The session is still being established; nothing is known yet. */
  loading: boolean
  /** The address bar is on the verification link. */
  onVerifyPath: boolean
  user: { role: string; mustChangePassword: boolean } | null
  /** 2FA is required for everyone and this user has not set it up. */
  enforce2FA: boolean
  /** A freshly minted recovery key is waiting to be written down. */
  recoveryKeyPending: boolean
  /** The stored vault is newer than this build knows how to read. */
  vaultVersionAhead: boolean
  vaultNeedsSetup: boolean
  vaultDecryptFailed: boolean
  vaultLocked: boolean
  vaultUnlocked: boolean
}

export function gateFor(state: GateState): Gate | null {
  // First of all, and for everyone: without the browser's crypto nothing past
  // sign-in can work, and signing in anyway ended in "wrong password" — a
  // message that sent people to the one thing that was not wrong. An admin, who
  // has no vault, is stopped too: their password would cross the network in
  // the clear just the same.
  if (!state.canEncrypt) return 'insecure'

  if (state.loading) return 'loading'

  // Ahead of the session check: following a verification link is how an account
  // comes into existence, so there is nobody to be signed in as yet.
  if (state.onVerifyPath) return 'verify'

  if (!state.user) return 'login'

  // Before 2FA: a password the user has been told to change is one somebody
  // else has seen, and enrolling a second factor around it protects the wrong
  // secret.
  if (state.user.mustChangePassword) return 'mustChangePassword'
  if (state.enforce2FA) return 'enforce2FA'

  // An administrator has no vault at all, so none of what follows can apply to
  // them. This one line replaces the `&& !isAdmin` that used to be repeated on
  // five separate branches and then a sixth time in the mirrored boolean.
  if (state.user.role === 'admin') return null

  if (state.recoveryKeyPending) return 'recoveryKey'

  // Before every other vault state: a vault this build cannot read will also
  // fail to decrypt and report itself locked, and those screens would invite
  // the user to fix it by typing their password, which cannot work and risks a
  // write that truncates data the newer build wrote.
  if (state.vaultVersionAhead) return 'vaultAhead'

  if (state.vaultNeedsSetup) return 'vaultSetup'
  if (state.vaultDecryptFailed) return 'vaultDecryptFailed'

  // `vaultLocked` is set when the session is restored on a page load, and
  // `!vaultUnlocked` covers the moment before the first unlock has happened at
  // all. Either way the key is not in memory and no figure can be shown.
  if (state.vaultLocked || !state.vaultUnlocked) return 'vaultLocked'

  return null
}
