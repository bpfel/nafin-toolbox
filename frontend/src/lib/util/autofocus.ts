/**
 * Puts the cursor in the field the user came to fill.
 *
 * A screen whose whole purpose is one entry — the 2FA code, the vault password,
 * the recovery key — should not also ask for a click before it will accept
 * typing. The code is already on the phone in your hand; reaching for the mouse
 * to place a caret is the only step in that flow that is not about the code.
 *
 * Marks the node as well as focusing it, so `focusTrap` can find it. In a modal
 * the trap focuses the first focusable element, which is the right default and
 * the wrong answer whenever the first control is a select with a sensible value
 * and the empty field is further down. One `use:autofocus` covers both cases:
 * outside a trap this focuses directly, inside one the trap honours the mark.
 */
export function autofocus(node: HTMLElement) {
  node.setAttribute('data-autofocus', '')

  // A frame later, for the same reason `focusTrap` waits: on mount the node is
  // in the document but a transition or a layout pass may not have settled, and
  // focusing something not yet laid out scrolls the page to the wrong place.
  const frame = requestAnimationFrame(() => {
    if (isDisabled(node)) return

    // Never take focus away from something the user already chose. A fast typist
    // can click into a second field inside one frame, and having the caret jump
    // back is worse than never having placed it.
    const active = document.activeElement
    if (active && active !== document.body && active !== node) return

    node.focus()
    caretToEnd(node)
  })

  return {
    destroy() {
      cancelAnimationFrame(frame)
    },
  }
}

function isDisabled(node: HTMLElement): boolean {
  return (node as HTMLInputElement).disabled === true || node.hasAttribute('disabled')
}

/**
 * Puts the caret after any existing text rather than selecting it.
 *
 * The balance correction opens with the current balance already in the field.
 * Selecting it would mean the first keystroke silently replaces a figure the
 * user may only have wanted to amend, and typing over your own money is a bad
 * default. Appending is recoverable; replacing is not.
 *
 * `setSelectionRange` throws on input types that have no text selection — date,
 * number, email — so only the ones that support it are touched.
 */
const SELECTABLE = new Set(['text', 'search', 'url', 'tel', 'password'])

function caretToEnd(node: HTMLElement): void {
  if (node instanceof HTMLTextAreaElement) {
    node.setSelectionRange(node.value.length, node.value.length)
    return
  }
  if (node instanceof HTMLInputElement && SELECTABLE.has(node.type)) {
    node.setSelectionRange(node.value.length, node.value.length)
  }
}
