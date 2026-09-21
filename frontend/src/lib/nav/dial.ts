import { getContext, setContext } from 'svelte'

/**
 * Whether a control is being rendered inside the action dial.
 *
 * `ActionButton` is the same square wherever it is used — beside an account's
 * name, in a screen's controls — but in the dial it also carries its label as a
 * visible pill. A phone has no hover, so the `title` that explains a glyph on a
 * desktop explains nothing there, and a vertical stack has room for words where
 * a horizontal strip did not.
 *
 * A context rather than a prop because the buttons are handed to the dial as an
 * opaque snippet: the screens build them, and nothing in between can reach in
 * and tell each one where it ended up.
 */
const DIAL = Symbol('action-dial')

/** Called by the dial itself, around whatever it renders. */
export function markDial(): void {
  setContext(DIAL, true)
}

/** Called by a control, to find out whether it is in one. */
export function inDial(): boolean {
  return getContext(DIAL) === true
}
