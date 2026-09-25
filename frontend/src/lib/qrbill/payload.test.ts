import { describe, test, expect } from 'vitest'
import { buildPayload } from './payload'
import type { QRAddress, QRBillRequest } from './types'

const creditor: QRAddress = {
  name: 'Robert Schneider AG',
  street: 'Rue du Lac',
  buildingNumber: '1268/2/22',
  postalCode: '2501',
  city: 'Biel',
  country: 'CH',
}

const debtor: QRAddress = {
  name: 'Pia-Maria Rutschmann-Schnyder',
  street: 'Grosse Marktgasse',
  buildingNumber: '28',
  postalCode: '9400',
  city: 'Rorschach',
  country: 'CH',
}

function minimalRequest(overrides: Partial<QRBillRequest> = {}): QRBillRequest {
  return {
    iban: 'CH9300762011623852957',
    creditor,
    currency: 'CHF',
    ...overrides,
  }
}

describe('buildPayload', () => {
  test('produces exactly 31 lines with no trailing newline', () => {
    const payload = buildPayload(minimalRequest())

    expect(payload.split('\n')).toHaveLength(31)
    expect(payload.endsWith('\n')).toBe(false)
    expect(payload.startsWith('SPC\n0200\n1\n')).toBe(true)
    expect(payload.endsWith('\nEPD')).toBe(true)
  })

  test('matches a known-good fixture byte for byte', () => {
    const payload = buildPayload({
      iban: 'CH93 0076 2011 6238 5295 7',
      creditor,
      currency: 'CHF',
      amount: '1949.75',
      debtor,
      referenceType: 'SCOR',
      reference: 'RF18539007547034',
      additionalInfo: 'Instruction of 15.09.2019',
    })

    const expected = [
      'SPC', // 0  header
      '0200', // 1  version
      '1', // 2  coding type (UTF-8)
      'CH9300762011623852957', // 3  creditor IBAN
      'S', // 4  creditor address type
      'Robert Schneider AG', // 5
      'Rue du Lac', // 6
      '1268/2/22', // 7
      '2501', // 8
      'Biel', // 9
      'CH', // 10
      '', // 11 ultimate creditor — reserved
      '', // 12
      '', // 13
      '', // 14
      '', // 15
      '', // 16
      '', // 17
      '1949.75', // 18 amount
      'CHF', // 19 currency
      'S', // 20 debtor address type
      'Pia-Maria Rutschmann-Schnyder', // 21
      'Grosse Marktgasse', // 22
      '28', // 23
      '9400', // 24
      'Rorschach', // 25
      'CH', // 26
      'SCOR', // 27 reference type
      'RF18539007547034', // 28 reference
      'Instruction of 15.09.2019', // 29 additional info
      'EPD', // 30 trailer
    ].join('\n')

    expect(payload).toBe(expected)
  })

  test('defaults an absent reference type to NON', () => {
    const lines = buildPayload(minimalRequest()).split('\n')

    expect(lines[27]).toBe('NON')
    expect(lines[28]).toBe('')
  })

  test('strips spaces from the creditor IBAN', () => {
    const lines = buildPayload(minimalRequest({ iban: 'CH93 0076 2011 6238 5295 7' })).split('\n')

    expect(lines[3]).toBe('CH9300762011623852957')
  })

  test('emits 7 empty lines for an absent debtor', () => {
    const lines = buildPayload(minimalRequest()).split('\n')

    expect(lines.slice(20, 27)).toEqual(['', '', '', '', '', '', ''])
  })

  test('leaves the amount line empty when no amount is given', () => {
    const lines = buildPayload(minimalRequest()).split('\n')

    expect(lines[18]).toBe('')
    expect(lines[19]).toBe('CHF')
  })

  test('reserves lines 11-17 for the ultimate creditor', () => {
    const lines = buildPayload(minimalRequest({ amount: '10.00', debtor })).split('\n')

    expect(lines.slice(11, 18)).toEqual(['', '', '', '', '', '', ''])
  })

  test('preserves non-ASCII characters in address fields', () => {
    const lines = buildPayload(
      minimalRequest({ creditor: { ...creditor, city: 'Zürich', name: 'Müller AG' } }),
    ).split('\n')

    expect(lines[5]).toBe('Müller AG')
    expect(lines[9]).toBe('Zürich')
  })
})
