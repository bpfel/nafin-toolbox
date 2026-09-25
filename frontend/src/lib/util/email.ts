/**
 * Whether an address could belong to an account.
 *
 * The same test the server applies to every address an account is created
 * with — `auth.ValidateEmail` — written again here so a form can refuse before
 * sending rather than after. Deliberately no stricter: an address the client
 * turned away and the server would have taken is a person who cannot be
 * invited for no reason anybody could explain.
 *
 * Something before the `@`, and a domain with a dot in it that does not end in
 * one. Not RFC 5322, which nobody's mail server honours in full either; this
 * catches the typos that happen — a missing domain, a dropped `.ch`.
 */
export function isPlausibleEmail(address: string): boolean {
  const at = address.indexOf('@')
  if (at < 1) return false
  const domain = address.slice(at + 1)
  return domain.includes('.') && !domain.endsWith('.')
}
