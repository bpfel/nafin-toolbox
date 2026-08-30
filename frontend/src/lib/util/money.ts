// Money input behaviour, shared by every amount field in the app.

/**
 * Normalises a typed amount into the exact form the Swiss QR bill standard
 * demands, and the form we store everywhere: no leading zeros, mandatory two
 * decimal places, '.' as the separator.
 *
 * Swiss keyboards and habits produce `1'234,50` and `1 234.5`; both become
 * `1234.50`. A bare `12` becomes `12.00`, which matters because a live bank
 * rejected `12` outright — the two decimals are not optional.
 *
 * Input that is not a number at all is returned cleaned but otherwise untouched,
 * so validation can report it against the field rather than a formatter
 * silently swallowing it.
 */
export function normalizeAmount(raw: string): string {
  // Apostrophe, right single quote (what iOS substitutes), and any whitespace.
  const cleaned = raw.replace(/['’\s]/g, '').replace(',', '.')
  if (cleaned === '') return ''
  if (!/^\d*\.?\d*$/.test(cleaned) || cleaned === '.') return cleaned

  const value = Number(cleaned)
  if (!Number.isFinite(value)) return cleaned
  // toFixed both pads to two places and drops leading zeros, and it rounds rather
  // than truncates — the normalised value is shown back to the user, so a rounded
  // third decimal is visible rather than silent.
  return value.toFixed(2)
}

/**
 * Parses a typed amount to a number, accepting exactly what normalizeAmount
 * accepts. Callers that need arithmetic on the value use this; callers that need
 * the stored string form use normalizeAmount.
 *
 * It lives here so the set of characters that count as noise is defined once.
 * de-CH formats a thousands separator as U+2019, not the ASCII apostrophe, so a
 * private copy of this that only stripped `'` could not re-read its own output
 * for any amount over 999.
 *
 * An empty string parses to 0, matching Number(''), so clearing a field zeroes
 * it rather than being rejected.
 */
export function parseAmount(raw: string): number {
  return Number(raw.replace(/['’\s]/g, '').replace(',', '.'))
}

/**
 * Svelte action for an amount field.
 *
 * Two behaviours, both about not making the user delete things:
 *
 * 1. **Select everything on focus.** Amount fields are seeded with a stored value
 *    — often '0.00' for a fresh reserve — and typing into an unselected field
 *    appends, so '0.00' plus a typed '5' becomes '0.005'. Selecting on focus makes
 *    the first keystroke replace the value, which is what every native currency
 *    field does. It also removes the need to clear a real value before editing it.
 *
 * 2. **Normalise on blur**, so the user sees the exact string that gets stored
 *    rather than having it change silently at submit time.
 *
 * The normalised value is written back through a dispatched `input` and `change`
 * event, so it reaches both `bind:value` and explicit `onchange` handlers. Setting
 * `input.value` alone would update the DOM and leave component state stale.
 */
export function moneyInput(node: HTMLInputElement) {
  function onFocus() {
    // requestAnimationFrame: iOS Safari moves the caret after the focus handler,
    // clearing a selection made synchronously.
    requestAnimationFrame(() => node.select())
  }

  function onBlur() {
    const normalised = normalizeAmount(node.value)
    if (normalised === node.value) return
    node.value = normalised
    node.dispatchEvent(new Event('input', { bubbles: true }))
    node.dispatchEvent(new Event('change', { bubbles: true }))
  }

  node.addEventListener('focus', onFocus)
  node.addEventListener('blur', onBlur)

  return {
    destroy() {
      node.removeEventListener('focus', onFocus)
      node.removeEventListener('blur', onBlur)
    },
  }
}

/**
 * Svelte action for a whole-number field, e.g. a period in months. Selects on
 * focus for the same reason; no normalisation to do.
 */
export function integerInput(node: HTMLInputElement) {
  function onFocus() {
    requestAnimationFrame(() => node.select())
  }

  node.addEventListener('focus', onFocus)

  return {
    destroy() {
      node.removeEventListener('focus', onFocus)
    },
  }
}
