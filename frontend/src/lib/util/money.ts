// Money, in and out — every amount field and every rendered figure in the app.

/**
 * Renders an amount the way Swiss money is written: a U+2019 thousands
 * separator, a '.' decimal point, always two decimal places.
 *
 * **Always de-CH, whatever the interface language is.** Someone reading the app
 * in French is still holding Swiss francs and still writing them 1’234.50; the
 * figures on their bank statement do not change language. Following `getLocale()`
 * here would render 1 234,50 to a French reader and silently disagree with every
 * other number they saw that day.
 *
 * A value that is not a number comes back untouched rather than as 'NaN', so a
 * corrupt stored amount shows as itself and can be recognised. An actual NaN
 * still renders 'NaN' — that one is a bug and should look like one.
 *
 * Every figure in the interface goes through here, and nearly all of them via
 * `<Money>` rather than by calling this directly. Reach for the function only
 * where the formatted text has to be interpolated into a sentence — a `t()`
 * placeholder — because a component cannot be passed as a string.
 */
export function formatAmount(
  value: string | number,
  options: { cents?: boolean; abs?: boolean } = {},
): string {
  const raw = typeof value === 'number' ? value : parseAmount(value)
  if (!Number.isFinite(raw)) return String(value)

  const amount = options.cents ? raw / 100 : raw
  const signed = options.abs ? Math.abs(amount) : amount

  return signed.toLocaleString('de-CH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

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
  const cleaned = cleanAmount(raw)
  if (cleaned === '') return ''
  if (!/^\d*\.?\d*$/.test(cleaned) || cleaned === '.') return cleaned

  // Padded to two places, leading zeros dropped, and a third decimal rounded
  // half away from zero rather than truncated — the normalised value is shown
  // back to the user, so the rounding is visible rather than silent. Exactly,
  // through cents: `toFixed` turned 1.005 into 1.00.
  return fromCents(centsOf(cleaned))
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
  return Number(cleanAmount(raw))
}

/**
 * A typed amount with the noise taken out — apostrophe, right single quote
 * (what iOS substitutes, and what de-CH formats with), any whitespace — and a
 * decimal comma made a point. For a field with rules of its own, such as one
 * that allows a minus; everything else wants `normalizeAmount` or `parseAmount`.
 */
export function cleanAmount(raw: string): string {
  return raw.replace(/['’\s]/g, '').replace(',', '.')
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

// --- Cents ------------------------------------------------------------------
//
// Money is a decimal string on the outside and integer cents (rappen) inside.
// One way in and one way out: there used to be three ways in, two of them by
// floating point, which rounded a third decimal differently from this one.

const MONEY_PATTERN = /^\s*(-?)(\d+)(?:\.(\d+))?\s*$/

/**
 * A stored amount in cents, exactly — no floating point. Throws on anything
 * that is not a decimal string: for figures that are stored, and so already
 * clean. A typed amount goes through `centsOf`.
 */
export function toCents(amount: string): number {
  const match = MONEY_PATTERN.exec(amount)
  if (!match) {
    throw new Error(`invalid amount '${amount}': expected a decimal string`)
  }
  const [, sign, whole, fraction = ''] = match
  const padded = `${fraction}000`
  const cents = Number(whole) * 100 + Number(padded.slice(0, 2))
  // A third decimal (or more) rounds half away from zero, matching the display
  // rounding a user would expect rather than truncating their money away.
  const rounded = Number(padded[2]) >= 5 ? cents + 1 : cents
  return sign === '-' ? -rounded : rounded
}

export function fromCents(cents: number): string {
  const sign = cents < 0 ? '-' : ''
  const absolute = Math.abs(cents)
  return `${sign}${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, '0')}`
}

/**
 * A typed amount in cents, by the same rules: `1’234,5` is 123450. What is not
 * an amount at all is 0, as an empty field is — validation is the field's job.
 */
export function centsOf(raw: string): number {
  const exact = cleanAmount(raw).replace(/^(-?)\./, (_, sign) => `${sign}0.`).replace(/\.$/, '')
  return MONEY_PATTERN.test(exact) ? toCents(exact) : 0
}
