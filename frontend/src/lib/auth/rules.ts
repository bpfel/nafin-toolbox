// The server's rules for what a user types, checked here first, under the
// server's own messages and codes.
//
// The forms used to leave these to the browser — `required`, `minlength`,
// `type="email"` — which refuses to submit and shows a bubble saying why.
// Firefox on Android refuses and shows nothing: the button did nothing, nothing
// reached the server, and there was no code to read out. So the forms are
// `novalidate` now, and anything they need checked before sending is checked
// here, where it can say so.
//
// Mostly the server's word is enough and nothing here is needed. It is needed
// where something irreversible happens before the request: changing a password
// re-wraps the vault key under the new one first, and a new password the
// server then refused would leave the vault behind a password nobody has.
//
// Messages and codes match backend/internal/auth/handler.go and
// backend/internal/apierror/apierror.go; keep them in step.

import { withCode } from '../api/client'

export const MIN_PASSWORD_LENGTH = 8

/**
 * Why the server would refuse this as a new password, or null if it would not.
 *
 * Go counts bytes and this counts UTF-16 units, which are never more, so a
 * password this lets through the server lets through too.
 */
export function passwordProblem(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return withCode({ error: 'password must be at least 8 characters', code: 'AUTH-051' })
  }
  return null
}

/** Why the server would refuse this password change, or null if it would not. */
export function passwordChangeProblem(current: string, next: string): string | null {
  if (!current || !next) {
    return withCode({ error: 'current and new password required', code: 'AUTH-018' })
  }
  return passwordProblem(next)
}
