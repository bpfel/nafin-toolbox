import { describe, test, expect } from 'vitest'
import { normalizeAmount, formatIBANForDisplay } from './format'
import { ibanStatus, validate } from './validate'
import type { QRAddress, QRBillRequest } from './types'

describe('normalizeAmount', () => {
  test('pads to the mandatory two decimal places', () => {
    // The case a real bank rejected: '12' and '12.5' are not valid amounts.
    expect(normalizeAmount('12')).toBe('12.00')
    expect(normalizeAmount('12.5')).toBe('12.50')
    expect(normalizeAmount('12.50')).toBe('12.50')
  })

  test('accepts Swiss thousands separators and the comma decimal', () => {
    expect(normalizeAmount("1'234.5")).toBe('1234.50')
    expect(normalizeAmount('1’234,50')).toBe('1234.50')
    expect(normalizeAmount('1 234,5')).toBe('1234.50')
  })

  test('strips leading zeros but keeps a legitimate sub-franc zero', () => {
    expect(normalizeAmount('0012.5')).toBe('12.50')
    expect(normalizeAmount('0.75')).toBe('0.75')
    expect(normalizeAmount('.5')).toBe('0.50')
  })

  test('rounds a third decimal rather than truncating', () => {
    expect(normalizeAmount('1234.567')).toBe('1234.57')
  })

  test('passes non-numeric input through for validate() to report', () => {
    expect(normalizeAmount('abc')).toBe('abc')
    expect(normalizeAmount('.')).toBe('.')
    expect(normalizeAmount('')).toBe('')
  })

  test('its output always satisfies validate()', () => {
    const creditor: QRAddress = {
      name: 'Robert Schneider AG',
      street: 'Rue du Lac',
      buildingNumber: '1268/2/22',
      postalCode: '2501',
      city: 'Biel',
      country: 'CH',
    }
    const base: QRBillRequest = { iban: 'CH9300762011623852957', creditor, currency: 'CHF' }

    for (const typed of ['12', '12.5', "1'234,5", '0012.50', '0.5']) {
      const amount = normalizeAmount(typed)
      expect(validate({ ...base, amount })).toEqual([])
    }
  })
})

describe('formatIBANForDisplay', () => {
  test('groups in blocks of four', () => {
    expect(formatIBANForDisplay('CH9300762011623852957')).toBe('CH93 0076 2011 6238 5295 7')
  })

  test('uppercases and tolerates existing spacing or punctuation', () => {
    expect(formatIBANForDisplay('ch93 0076-2011')).toBe('CH93 0076 2011')
  })

  test('is idempotent, so it can run on every keystroke', () => {
    const once = formatIBANForDisplay('CH9300762011623852957')
    expect(formatIBANForDisplay(once)).toBe(once)
  })

  test('handles the empty case', () => {
    expect(formatIBANForDisplay('')).toBe('')
  })
})

describe('ibanStatus', () => {
  test('distinguishes unfinished from wrong', () => {
    // Do not shout at someone three characters into a 21-character identifier.
    expect(ibanStatus('CH93')).toBe('incomplete')
    expect(ibanStatus('CH93 0076 2011')).toBe('incomplete')
  })

  test('reports a completed valid IBAN', () => {
    expect(ibanStatus('CH9300762011623852957')).toBe('valid')
    expect(ibanStatus('CH93 0076 2011 6238 5295 7')).toBe('valid')
  })

  test('catches a transposed digit once the length is right', () => {
    expect(ibanStatus('CH9300762011623852975')).toBe('invalid')
  })

  test('rejects obvious nonsense immediately', () => {
    expect(ibanStatus('XX!!')).toBe('invalid')
  })

  test('empty is its own state, not an error', () => {
    expect(ibanStatus('')).toBe('empty')
    expect(ibanStatus('   ')).toBe('empty')
  })
})
