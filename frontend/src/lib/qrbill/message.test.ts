import { describe, test, expect } from 'vitest'
import { billMessage } from './message'
import { validate } from './validate'
import type { QRBillRequest } from './types'

describe('billMessage', () => {
  test('an ordinary entry name passes through unchanged', () => {
    expect(billMessage('Cantonal tax')).toBe('Cantonal tax')
  })

  test('trims and collapses whitespace', () => {
    // A name that wrapped in the budget would otherwise arrive with a line
    // break in the middle of a payment instruction.
    expect(billMessage('  Cantonal\n  tax  ')).toBe('Cantonal tax')
  })

  test('cuts at 140 characters', () => {
    const long = 'a'.repeat(200)
    expect(billMessage(long)).toHaveLength(140)
  })

  test('counts code points, not bytes — so an accent is one character', () => {
    // `validate` counts the field the same way: 'Müller' is six, not seven.
    const accented = 'ü'.repeat(140)
    expect([...billMessage(accented)]).toHaveLength(140)
    expect(billMessage(accented)).toBe(accented)
  })

  test('never cuts a surrogate pair in half', () => {
    // A plain slice(0, 140) would split the last pair and leave a lone
    // surrogate in the payload.
    const paired = '🚗'.repeat(200)
    const message = billMessage(paired)

    expect([...message]).toHaveLength(140)
    expect(message).toBe('🚗'.repeat(140))
    expect(message).not.toMatch(/[\uD800-\uDBFF]$/)
  })

  test('an empty or blank name yields nothing to put on the bill', () => {
    expect(billMessage('')).toBe('')
    expect(billMessage('   ')).toBe('')
  })

  test('what it produces is accepted by the validator', () => {
    const request: QRBillRequest = {
      iban: 'CH9300762011623852957',
      creditor: {
        name: 'Anna Muster',
        street: 'Musterstrasse',
        buildingNumber: '1',
        postalCode: '8000',
        city: 'Zürich',
        country: 'CH',
      },
      currency: 'CHF',
      referenceType: 'NON',
      reference: '',
      additionalInfo: billMessage('x'.repeat(500)),
    }

    // The 140-character cap is the one the validator enforces, so the longest
    // message this can produce must still be a legal one.
    expect(validate(request).filter(e => e.field === 'additionalInfo')).toEqual([])
  })
})
