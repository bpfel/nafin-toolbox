// Input formatting for QR bill fields.
//
// Pure display/normalisation helpers, kept out of validate.ts so that validation
// stays a report on a finished value while these shape what the user typed into
// one. Nothing here rejects anything — malformed input is passed through so
// validate() reports it, rather than a formatter silently swallowing it.

/**
 * Normalises a typed amount into the exact form the standard demands:
 * no leading zeros, mandatory two decimal places, '.' as the separator.
 *
 * Swiss keyboards and habits produce `1'234,50` and `1 234.5`; both become
 * `1234.50`. A bare `12` becomes `12.00`, which matters because a live bank
 * rejected `12` outright — the two decimals are not optional.
 *
 * Input that is not a number at all is returned cleaned but otherwise untouched,
 * so `validate()` can report it against the field.
 */
export function normalizeAmount(raw: string): string {
  // Apostrophe, right single quote (what iOS produces), and any whitespace.
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
 * Groups an IBAN into blocks of four for display: the conventional way it is
 * printed, and much easier to check against a bank statement by eye.
 *
 * Storage and validation use the unspaced form; this is presentation only.
 */
export function formatIBANForDisplay(raw: string): string {
  const cleaned = raw.replace(/[^0-9A-Za-z]/g, '').toUpperCase()
  const grouped = cleaned.match(/.{1,4}/g)
  return grouped ? grouped.join(' ') : ''
}
