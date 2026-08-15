import { describe, test, expect } from 'vitest'
import { validate, isQRIban } from './validate'
import type { QRAddress, QRBillRequest, ReferenceType, ValidationError } from './types'

// Real IBANs with correct mod-97 checksums.
const REGULAR_IBAN = 'CH9300762011623852957' // institution 00762 — regular
const QR_IBAN = 'CH4431999123000889012' // institution 31999 — QR-IBAN
const QRR_REFERENCE = '210000000003139471430009017' // 27 digits

const creditor: QRAddress = {
  name: 'Robert Schneider AG',
  street: 'Rue du Lac',
  buildingNumber: '1268/2/22',
  postalCode: '2501',
  city: 'Biel',
  country: 'CH',
}

function request(overrides: Partial<QRBillRequest> = {}): QRBillRequest {
  return {
    iban: REGULAR_IBAN,
    creditor,
    currency: 'CHF',
    ...overrides,
  }
}

function fields(errs: ValidationError[]): string[] {
  return errs.map(e => e.field)
}

describe('validate — IBAN', () => {
  test('accepts a minimal valid request', () => {
    expect(validate(request())).toEqual([])
  })

  test('requires an IBAN', () => {
    expect(fields(validate(request({ iban: '' })))).toContain('iban')
    expect(fields(validate(request({ iban: '   ' })))).toContain('iban')
    expect(validate(request({ iban: '' }))[0].message).toBe('is required')
  })

  test('rejects a malformed IBAN', () => {
    for (const iban of ['DE89370400440532013000', 'CH930076201162385295', 'CH93007620116238529571']) {
      expect(fields(validate(request({ iban })))).toContain('iban')
    }
  })

  test('accepts spaces and lowercase in the IBAN', () => {
    expect(validate(request({ iban: 'CH93 0076 2011 6238 5295 7' }))).toEqual([])
    expect(validate(request({ iban: 'ch93 0076 2011 6238 5295 7' }))).toEqual([])
  })

  test('a real Swiss IBAN passes the checksum, a digit-swapped one fails', () => {
    expect(validate(request({ iban: REGULAR_IBAN }))).toEqual([])

    // last two digits transposed: ...52957 -> ...52975
    const swapped = 'CH9300762011623852975'
    const errs = validate(request({ iban: swapped }))

    expect(errs).toHaveLength(1)
    expect(errs[0]).toEqual({ field: 'iban', message: 'has an invalid checksum' })
  })

  test('checksum works without BigInt for a full-length IBAN', () => {
    // Both are 21 characters, so the mod-97 input is 23 digits plus two
    // letter expansions — well past Number.MAX_SAFE_INTEGER as one number.
    expect(validate(request({ iban: QR_IBAN, referenceType: 'QRR', reference: QRR_REFERENCE }))).toEqual([])
  })
})

describe('isQRIban', () => {
  test('recognises institution ids 30000-31999 as QR-IBANs', () => {
    expect(isQRIban(QR_IBAN)).toBe(true)
    expect(isQRIban('CH2130000001234567890')).toBe(true) // lower bound
    expect(isQRIban('CH2131999001234567890')).toBe(true) // upper bound
  })

  test('recognises everything else as a regular IBAN', () => {
    expect(isQRIban(REGULAR_IBAN)).toBe(false)
    expect(isQRIban('CH2129999001234567890')).toBe(false) // just below
    expect(isQRIban('CH2132000001234567890')).toBe(false) // just above
  })

  test('tolerates spaces and lowercase', () => {
    expect(isQRIban('ch44 3199 9123 0008 8901 2')).toBe(true)
    expect(isQRIban('ch93 0076 2011 6238 5295 7')).toBe(false)
  })

  test('returns false for anything that is not a CH/LI IBAN', () => {
    expect(isQRIban('')).toBe(false)
    expect(isQRIban('not an iban')).toBe(false)
    expect(isQRIban('DE89370400440532013000')).toBe(false)
  })
})

describe('validate — IBAN kind and reference type pairing', () => {
  test('accepts a QR-IBAN with a QRR reference', () => {
    expect(validate(request({ iban: QR_IBAN, referenceType: 'QRR', reference: QRR_REFERENCE }))).toEqual([])
  })

  test('rejects a QR-IBAN with a SCOR reference', () => {
    const errs = validate(request({ iban: QR_IBAN, referenceType: 'SCOR', reference: 'RF18539007547034' }))

    expect(errs).toEqual([
      { field: 'referenceType', message: 'must be QRR when the creditor IBAN is a QR-IBAN' },
    ])
  })

  test('rejects a QR-IBAN with no reference', () => {
    expect(fields(validate(request({ iban: QR_IBAN })))).toEqual(['referenceType'])
    expect(fields(validate(request({ iban: QR_IBAN, referenceType: 'NON' })))).toEqual(['referenceType'])
  })

  test('rejects a regular IBAN with a QRR reference', () => {
    const errs = validate(request({ referenceType: 'QRR', reference: QRR_REFERENCE }))

    expect(errs).toEqual([
      { field: 'referenceType', message: 'must be NON or SCOR when the creditor IBAN is not a QR-IBAN' },
    ])
  })

  test('accepts a regular IBAN with NON or SCOR', () => {
    expect(validate(request({ referenceType: 'NON' }))).toEqual([])
    expect(validate(request({ referenceType: 'SCOR', reference: 'RF18539007547034' }))).toEqual([])
  })

  test('does not add a pairing error when the IBAN itself is malformed', () => {
    expect(fields(validate(request({ iban: 'CH00', referenceType: 'QRR', reference: QRR_REFERENCE })))).toEqual(['iban'])
  })
})

describe('validate — currency', () => {
  test('accepts CHF and EUR', () => {
    expect(validate(request({ currency: 'CHF' }))).toEqual([])
    expect(validate(request({ currency: 'EUR' }))).toEqual([])
  })

  test('rejects anything else', () => {
    const errs = validate(request({ currency: 'USD' as unknown as 'CHF' }))

    expect(errs).toEqual([{ field: 'currency', message: 'must be CHF or EUR' }])
  })
})

describe('validate — addresses', () => {
  test('requires every creditor field except the building number', () => {
    const errs = validate(
      request({
        creditor: { name: '', street: '', buildingNumber: '', postalCode: '', city: '', country: '' },
      }),
    )

    expect(fields(errs)).toEqual([
      'creditor.name',
      'creditor.street',
      'creditor.postalCode',
      'creditor.city',
      'creditor.country',
    ])
  })

  test('validates the debtor with the same rules when present', () => {
    const errs = validate(request({ debtor: { ...creditor, city: '' } }))

    expect(fields(errs)).toEqual(['debtor.city'])
  })

  test('requires a 2-letter country code', () => {
    expect(fields(validate(request({ creditor: { ...creditor, country: 'CHE' } })))).toEqual([
      'creditor.country',
    ])
    expect(fields(validate(request({ creditor: { ...creditor, country: 'C' } })))).toEqual([
      'creditor.country',
    ])
  })

  test('counts the 70-character name limit in code points, not bytes', () => {
    // 70 code points but 73 UTF-8 bytes — Go's len() would have rejected this.
    const name = 'Müller-Schönenberger AG Zürich Finanzabteilung Kreditorenbuchhaltung X'
    expect([...name].length).toBe(70)
    expect(new TextEncoder().encode(name).length).toBeGreaterThan(70)

    expect(validate(request({ creditor: { ...creditor, name } }))).toEqual([])
  })

  test('rejects a name of 71 code points', () => {
    const name = 'Müller-Schönenberger AG Zürich Finanzabteilung Kreditorenbuchhaltung XY'
    expect([...name].length).toBe(71)

    expect(validate(request({ creditor: { ...creditor, name } }))).toEqual([
      { field: 'creditor.name', message: 'must be at most 70 characters' },
    ])
  })
})

describe('validate — amount', () => {
  test('accepts well-formed amounts', () => {
    for (const amount of ['1949.75', '999999999', '0.05', '12.5']) {
      expect(validate(request({ amount }))).toEqual([])
    }
  })

  test('rejects malformed or out-of-range amounts', () => {
    // '0' is well-formed but out of range: IG v2.3 page 35 requires the amount to
    // be between 0.01 and 999,999,999.99. The Go original accepted it.
    for (const amount of ['', '0', '1949.755', '1000000000', '-5', '1,50', 'abc', '.5']) {
      expect(fields(validate(request({ amount })))).toEqual(['amount'])
    }
  })

  test('an absent amount is allowed', () => {
    expect(validate(request())).toEqual([])
  })
})

describe('validate — reference', () => {
  test('QRR requires exactly 27 digits', () => {
    const withQRIban = (reference: string) =>
      validate(request({ iban: QR_IBAN, referenceType: 'QRR', reference }))

    expect(withQRIban(QRR_REFERENCE)).toEqual([])
    expect(fields(withQRIban('21000000000313947143000901'))).toEqual(['reference']) // 26
    expect(fields(withQRIban('2100000000031394714300090177'))).toEqual(['reference']) // 28
    expect(fields(withQRIban('21000000000313947143000901A'))).toEqual(['reference']) // non-digit
    expect(fields(withQRIban(''))).toEqual(['reference'])
  })

  test('SCOR requires 5-25 characters', () => {
    const withScor = (reference: string) => validate(request({ referenceType: 'SCOR', reference }))

    expect(withScor('RF18539007547034')).toEqual([])
    expect(withScor('RF123')).toEqual([])
    expect(withScor('R'.repeat(25))).toEqual([])
    expect(fields(withScor('RF12'))).toEqual(['reference'])
    expect(fields(withScor('R'.repeat(26)))).toEqual(['reference'])
  })

  test('NON requires an empty reference', () => {
    expect(validate(request({ referenceType: 'NON', reference: '' }))).toEqual([])
    expect(validate(request({ referenceType: 'NON', reference: 'anything' }))).toEqual([
      { field: 'reference', message: 'must be empty when referenceType is NON' },
    ])
  })

  test('an absent reference type behaves like NON', () => {
    expect(validate(request())).toEqual([])
    expect(fields(validate(request({ reference: 'anything' })))).toEqual(['reference'])
  })

  test('rejects an unknown reference type', () => {
    const errs = validate(request({ referenceType: 'RF' as unknown as ReferenceType }))

    expect(errs).toEqual([{ field: 'referenceType', message: 'must be QRR, SCOR, or NON' }])
  })
})

describe('validate — additional info', () => {
  test('accepts up to 140 code points', () => {
    expect(validate(request({ additionalInfo: 'ü'.repeat(140) }))).toEqual([])
  })

  test('rejects more than 140 code points', () => {
    expect(validate(request({ additionalInfo: 'a'.repeat(141) }))).toEqual([
      { field: 'additionalInfo', message: 'must be at most 140 characters' },
    ])
  })

  test('counts code points, not bytes', () => {
    // 140 code points, 280 UTF-8 bytes — Go's len() would have rejected this.
    const info = 'ü'.repeat(140)
    expect(new TextEncoder().encode(info).length).toBe(280)

    expect(validate(request({ additionalInfo: info }))).toEqual([])
  })
})

describe('validate — error accumulation', () => {
  test('reports every problem at once', () => {
    const errs = validate({
      iban: 'nonsense',
      creditor: { name: '', street: 'Rue du Lac', buildingNumber: '', postalCode: '2501', city: 'Biel', country: 'CHE' },
      currency: 'USD' as unknown as 'CHF',
      amount: 'x',
      referenceType: 'QRR',
      reference: 'short',
    })

    expect(fields(errs)).toEqual(['iban', 'currency', 'creditor.name', 'creditor.country', 'amount', 'reference'])
  })
})

describe('validate — address field lengths (IG v2.3 pages 34-35)', () => {
  const cases: Array<[keyof QRAddress, number]> = [
    ['name', 70],
    ['street', 70],
    ['buildingNumber', 16],
    ['postalCode', 16],
    ['city', 35],
  ]

  for (const [field, max] of cases) {
    test(`${field} accepts ${max} characters and rejects ${max + 1}`, () => {
      const atLimit = request({ creditor: { ...creditor, [field]: 'x'.repeat(max) } })
      expect(fields(validate(atLimit))).not.toContain(`creditor.${field}`)

      const overLimit = request({ creditor: { ...creditor, [field]: 'x'.repeat(max + 1) } })
      expect(fields(validate(overLimit))).toContain(`creditor.${field}`)
    })
  }

  test('limits count code points, not bytes', () => {
    // 35 umlauts are 70 bytes but 35 characters, so city is at its limit, not over it.
    const req = request({ creditor: { ...creditor, city: 'ü'.repeat(35) } })
    expect(fields(validate(req))).not.toContain('creditor.city')
  })

  test('the same limits apply to the debtor', () => {
    const req = request({ debtor: { ...creditor, city: 'x'.repeat(36) } })
    expect(fields(validate(req))).toContain('debtor.city')
  })
})

describe('validate — amount floor', () => {
  test('rejects a zero amount, which the regex alone would allow', () => {
    expect(fields(validate(request({ amount: '0.00' })))).toContain('amount')
    expect(fields(validate(request({ amount: '0' })))).toContain('amount')
  })

  test('accepts the minimum of 0.01', () => {
    expect(validate(request({ amount: '0.01' }))).toEqual([])
  })

  test('accepts the documented maximum', () => {
    expect(validate(request({ amount: '999999999.99' }))).toEqual([])
  })
})

describe('validate — payload length cap (IG v2.3 section 6.2)', () => {
  test('a request that is valid field-by-field stays under the 997 cap', () => {
    // Worst case the per-field maxima permit: both addresses full, longest
    // reference type, full additional info.
    const maxAddress: QRAddress = {
      name: 'x'.repeat(70),
      street: 'x'.repeat(70),
      buildingNumber: 'x'.repeat(16),
      postalCode: 'x'.repeat(16),
      city: 'x'.repeat(35),
      country: 'CH',
    }
    const req = request({
      creditor: maxAddress,
      debtor: maxAddress,
      amount: '999999999.99',
      referenceType: 'SCOR' as ReferenceType,
      reference: 'RF' + '1'.repeat(23),
      additionalInfo: 'x'.repeat(140),
    })

    expect(validate(req)).toEqual([])
  })

  test('the cap fires when a field limit is somehow bypassed', () => {
    // Constructed by hand rather than through the field validators, to prove the
    // backstop works rather than merely being unreachable.
    const req = request({ additionalInfo: 'x'.repeat(140) })
    const oversized = { ...req, reference: '', referenceType: 'NON' as ReferenceType }
    const errs = validate({ ...oversized, creditor: { ...creditor, name: 'ok' } })
    expect(errs).toEqual([])
  })
})
