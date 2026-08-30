import { describe, test, expect } from 'vitest'
import { normalizeAmount, parseAmount } from './money'

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

describe('parseAmount — reading back what we printed', () => {
  // de-CH groups thousands with U+2019, not the ASCII apostrophe. A parser that
  // strips only `'` returns NaN for its own formatter's output, which is how the
  // category dialog silently discarded edits to any amount over 999.
  test('accepts the separator toLocaleString actually emits', () => {
    const shown = (1350).toLocaleString('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

    expect(shown).toBe('1\u2019350.00')
    expect(parseAmount(shown)).toBe(1350)
  })

  test('accepts the ASCII apostrophe people actually type', () => {
    expect(parseAmount("1'350.00")).toBe(1350)
  })

  test('accepts a comma decimal and stray spaces', () => {
    expect(parseAmount('1350,50')).toBe(1350.5)
    expect(parseAmount(' 1 350.50 ')).toBe(1350.5)
  })

  test('an empty field reads as zero, not as nothing', () => {
    expect(parseAmount('')).toBe(0)
  })

  test('genuine nonsense is NaN, so callers can reject it', () => {
    expect(parseAmount('abc')).toBeNaN()
  })
})
