import { describe, test, expect } from 'vitest'
import { formatAmount, normalizeAmount, parseAmount, centsOf, fromCents, toCents } from './money'

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

    // Not spelled out: which character this is has changed between ICU builds,
    // and reading whichever one is emitted is the entire point of the test.
    expect(shown).not.toBe('1350.00')
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

describe('formatAmount — one formatter instead of twelve', () => {
  test('always two decimals, because a franc is never written 12', () => {
    expect(formatAmount('12')).toBe('12.00')
    expect(formatAmount(12)).toBe('12.00')
    expect(formatAmount('12.5')).toBe('12.50')
  })

  test('its own output reads back through parseAmount', () => {
    // The invariant that matters. A formatted amount is put straight back into
    // an input field when an entry is edited, so a separator our parser cannot
    // read would lose the value silently — which it once did, above 999.
    const shown = formatAmount('1234.50')
    expect(shown).not.toBe('1234.50')
    expect(parseAmount(shown)).toBe(1234.5)
  })

  test('reads centimes where the caller does exact arithmetic', () => {
    // The accounts totals are summed in integers to avoid float drift and only
    // become francs at the point of display.
    expect(formatAmount(123456, { cents: true })).toBe(formatAmount('1234.56'))
    expect(formatAmount(-500, { cents: true })).toBe(formatAmount('-5'))
  })

  test('drops the sign where the sentence already carries it', () => {
    // "CHF 380.00 short of the tax bill" — the shortfall reads as a magnitude,
    // and "-380.00 short" would say the opposite of what is meant.
    expect(formatAmount('-380', { abs: true })).toBe('380.00')
    expect(formatAmount('380', { abs: true })).toBe('380.00')
  })

  test('a value that is not a number comes back as itself, not as NaN', () => {
    // Only the account card used to guard this; the other eleven copies rendered
    // 'NaN' at the user. Showing the stored string back is what makes a corrupt
    // amount recognisable instead of merely broken.
    expect(formatAmount('not an amount')).toBe('not an amount')
  })
})

/**
 * One way into cents, exactly. There used to be three, two by floating point:
 * 1.005 × 100 is 100.49999…, so a third decimal of 5 was rounded down there and
 * up here.
 */
describe('cents — exact, whichever way the amount came in', () => {
  test('a third decimal of 5 rounds away from zero, typed or stored', () => {
    expect(toCents('1.005')).toBe(101)
    expect(centsOf('1.005')).toBe(101)
    expect(normalizeAmount('1.005')).toBe('1.01')
    expect(toCents('-1.005')).toBe(-101)
  })

  test('a typed amount reads as people type it', () => {
    expect(centsOf('1’234,5')).toBe(123450)
    expect(centsOf("1'234.50")).toBe(123450)
    expect(centsOf('.5')).toBe(50)
    expect(centsOf('12.')).toBe(1200)
    expect(centsOf('')).toBe(0)
    expect(centsOf('abc')).toBe(0)
  })

  test('and back out, with two places and the sign', () => {
    expect(fromCents(123450)).toBe('1234.50')
    expect(fromCents(-5)).toBe('-0.05')
  })
})

/**
 * Moving Belege, the entry dialog and the balances from floating point to the
 * exact conversion must not move any figure already stored: every stored
 * amount has two decimals, and for those the two always agreed.
 */
describe('cents — no stored figure changes', () => {
  test('every two-decimal amount reads the same as the floating-point way did', () => {
    // Every rappen from -10.00 to 10.00, then a sparse sweep to 25'000.00.
    const amounts = [...Array.from({ length: 2001 }, (_, i) => i - 1000), ...Array.from({ length: 2500 }, (_, i) => i * 997)]
    for (const n of amounts) {
      const stored = fromCents(n)
      const floating = Math.round(Number(stored) * 100)
      expect(centsOf(stored)).toBe(floating)
      expect(toCents(stored)).toBe(floating)
      expect(normalizeAmount(stored.replace('-', ''))).toBe((Math.abs(floating) / 100).toFixed(2))
    }
  })
})
