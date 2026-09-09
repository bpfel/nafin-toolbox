const FOCUSABLE = 'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'

export function focusTrap(node: HTMLElement) {
  const previouslyFocused = document.activeElement as HTMLElement | null

  function getFocusable(): HTMLElement[] {
    return Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE))
  }

  // Focus the field the dialog is actually asking for, falling back to the first
  // focusable element.
  //
  // First-focusable is right for a confirmation, whose first control is its
  // cancel button, and wrong for a form whose first control is a select that
  // already holds a good value — there the empty field further down is the one
  // being asked for. `use:autofocus` marks that field; nothing else changes.
  requestAnimationFrame(() => {
    const elements = getFocusable()
    if (elements.length === 0) return
    const requested = node.querySelector<HTMLElement>('[data-autofocus]')
    ;(requested ?? elements[0]).focus()
  })

  function handleKeydown(e: KeyboardEvent) {
    if (e.key !== 'Tab') return

    const elements = getFocusable()
    if (elements.length === 0) return

    const first = elements[0]
    const last = elements[elements.length - 1]

    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  node.addEventListener('keydown', handleKeydown)

  return {
    destroy() {
      node.removeEventListener('keydown', handleKeydown)
      previouslyFocused?.focus()
    },
  }
}
