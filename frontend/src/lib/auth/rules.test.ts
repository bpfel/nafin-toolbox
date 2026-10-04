import { describe, test, expect } from 'vitest'
import { passwordProblem, passwordChangeProblem } from './rules'

describe('the server rules, checked first', () => {
  test('a password under 8 characters is refused with AUTH-051', () => {
    expect(passwordProblem('1234567')).toBe('password must be at least 8 characters (AUTH-051)')
    expect(passwordProblem('12345678')).toBeNull()
  })

  test('a password change with either field empty is refused with AUTH-018', () => {
    expect(passwordChangeProblem('', 'new-pass-456')).toBe('current and new password required (AUTH-018)')
    expect(passwordChangeProblem('old-pass-123', '')).toBe('current and new password required (AUTH-018)')
    expect(passwordChangeProblem('old-pass-123', 'new-pass-456')).toBeNull()
  })
})
