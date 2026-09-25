import { describe, test, expect } from 'vitest'
import { isPlausibleEmail } from './email'

/**
 * Mirrors `ValidateEmail` in `backend/internal/auth/handler.go`, case for case
 * with its table in `handler_test.go`. The two must agree: stricter here turns
 * away people the server would admit, looser sends invitations it refuses.
 */
describe('an address an account could have', () => {
  test.each(['anna@example.ch', 'a@b.co', 'anna.muster+wg@sub.example.ch'])('%s is', address => {
    expect(isPlausibleEmail(address)).toBe(true)
  })

  test.each(['', 'anna', '@example.ch', 'anna@', 'anna@example', 'anna@example.', 'a@a'])(
    '%s is not',
    address => {
      expect(isPlausibleEmail(address)).toBe(false)
    },
  )
})
