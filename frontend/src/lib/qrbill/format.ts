// Input formatting for QR bill fields.
//
// Pure display/normalisation helpers, kept out of validate.ts so that validation
// stays a report on a finished value while these shape what the user typed into
// one. Nothing here rejects anything — malformed input is passed through so
// validate() reports it, rather than a formatter silently swallowing it.

// Amount normalisation is general money handling, not QR-specific — it lives in
// lib/util/money.ts alongside the input actions that use it. Re-exported here so
// QR bill code can reach it without knowing that.
export { normalizeAmount } from '../util/money'

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
