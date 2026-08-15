import { describe, test, expect } from 'vitest'
import { normalizeAmount } from './money'

describe('normalizeAmount — the 0.00 prefill problem', () => {
  // The field is seeded with a stored '0.00'. Without select-on-focus, typing
  // appends and you get 0.005 — which is what prompted this. The action handles
  // the selection; these pin the normalisation half.
  test('a value typed over the seed normalises cleanly', () => {
    expect(normalizeAmount('5')).toBe('5.00')
    expect(normalizeAmount('4700')).toBe('4700.00')
  })

  test('the accidental append is at least normalised rather than stored raw', () => {
    // If selection somehow fails, 0.005 still becomes a legal two-decimal value
    // rather than reaching the vault with three.
    expect(normalizeAmount('0.005')).toBe('0.01')
  })
})
