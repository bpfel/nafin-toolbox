import type { QRAddress, QRBillRequest, ValidationError } from './types'

// Ported from backend/internal/qrbill/validate.go with three deliberate
// corrections, each marked CORRECTION below:
//   1. length limits count code points, not UTF-8 bytes (Go's len())
//   2. the mod-97 IBAN checksum uses an iterative remainder, not big.Int
//   3. the IBAN-kind / reference-type pairing rule is enforced (absent in Go)

const amountRegex = /^\d{1,9}(\.\d{1,2})?$/
const ibanRegex = /^(CH|LI)\d{19}$/
const qrrRegex = /^\d{27}$/

/** Code point count. CORRECTION 1: Go's len() counted bytes, so "Müller" was 7. */
function charLength(s: string): number {
  return [...s].length
}

function normalizeIBAN(iban: string): string {
  return iban.replace(/ /g, '').toUpperCase()
}

/**
 * A Swiss QR-IBAN is identified by its institution id — the five digits
 * following "CHkk" (characters 4..8) — falling in the range 30000-31999.
 * QR-IBANs accept only QRR references; regular IBANs only NON or SCOR.
 */
export function isQRIban(iban: string): boolean {
  const cleaned = normalizeIBAN(iban)
  if (!ibanRegex.test(cleaned)) return false
  const institution = Number(cleaned.slice(4, 9))
  return institution >= 30000 && institution <= 31999
}

/**
 * Verifies the IBAN mod-97 checksum: move the first 4 characters to the end,
 * convert letters to digits (A=10..Z=35), and check that the result mod 97 is 1.
 *
 * CORRECTION 2: the Go used math/big to hold the ~24-digit number. Folding the
 * remainder in as we go keeps every intermediate below 970, so no BigInt is
 * needed and nothing can overflow.
 */
function validIBANChecksum(iban: string): boolean {
  const rearranged = iban.slice(4) + iban.slice(0, 4)

  let digits = ''
  for (const ch of rearranged) {
    if (ch >= 'A' && ch <= 'Z') {
      digits += String(ch.charCodeAt(0) - 'A'.charCodeAt(0) + 10)
    } else if (ch >= '0' && ch <= '9') {
      digits += ch
    } else {
      return false
    }
  }

  let rem = 0
  for (const d of digits) {
    rem = (rem * 10 + Number(d)) % 97
  }
  return rem === 1
}

export function validate(req: QRBillRequest): ValidationError[] {
  let errs: ValidationError[] = []

  errs = validateIBAN(req.iban, errs)
  errs = validateCurrency(req.currency, errs)
  errs = validateAddress(req.creditor, 'creditor', true, errs)

  if (req.amount !== undefined) {
    if (!amountRegex.test(req.amount)) {
      errs.push({
        field: 'amount',
        message: 'must be a decimal number with up to 9 integer digits and up to 2 decimal places',
      })
    }
  }

  if (req.debtor) {
    errs = validateAddress(req.debtor, 'debtor', true, errs)
  }

  errs = validateReference(req.referenceType ?? '', req.reference ?? '', errs)
  errs = validateIBANReferencePairing(req.iban, req.referenceType ?? '', errs)

  if (charLength(req.additionalInfo ?? '') > 140) {
    errs.push({
      field: 'additionalInfo',
      message: 'must be at most 140 characters',
    })
  }

  return errs
}

function validateIBAN(iban: string, errs: ValidationError[]): ValidationError[] {
  const cleaned = normalizeIBAN(iban ?? '')
  if (cleaned === '') {
    errs.push({ field: 'iban', message: 'is required' })
    return errs
  }
  if (!ibanRegex.test(cleaned)) {
    errs.push({
      field: 'iban',
      message: 'must be a valid Swiss or Liechtenstein IBAN (CH/LI followed by 19 digits)',
    })
    return errs
  }
  if (!validIBANChecksum(cleaned)) {
    errs.push({ field: 'iban', message: 'has an invalid checksum' })
  }
  return errs
}

function validateCurrency(currency: string, errs: ValidationError[]): ValidationError[] {
  if (currency !== 'CHF' && currency !== 'EUR') {
    errs.push({ field: 'currency', message: 'must be CHF or EUR' })
  }
  return errs
}

function validateAddress(
  addr: QRAddress,
  prefix: string,
  required: boolean,
  errs: ValidationError[],
): ValidationError[] {
  if (required) {
    if (!addr.name) errs.push({ field: `${prefix}.name`, message: 'is required' })
    if (!addr.street) errs.push({ field: `${prefix}.street`, message: 'is required' })
    if (!addr.postalCode) errs.push({ field: `${prefix}.postalCode`, message: 'is required' })
    if (!addr.city) errs.push({ field: `${prefix}.city`, message: 'is required' })
    if (!addr.country) errs.push({ field: `${prefix}.country`, message: 'is required' })
  }
  if (charLength(addr.name ?? '') > 70) {
    errs.push({ field: `${prefix}.name`, message: 'must be at most 70 characters' })
  }
  const countryLength = charLength(addr.country ?? '')
  if (countryLength !== 0 && countryLength !== 2) {
    errs.push({ field: `${prefix}.country`, message: 'must be a 2-letter country code' })
  }
  return errs
}

function validateReference(
  refType: string,
  ref: string,
  errs: ValidationError[],
): ValidationError[] {
  switch (refType) {
    case '':
    case 'NON':
      if (ref !== '') {
        errs.push({
          field: 'reference',
          message: 'must be empty when referenceType is NON',
        })
      }
      break
    case 'QRR':
      if (!qrrRegex.test(ref)) {
        errs.push({
          field: 'reference',
          message: 'must be exactly 27 digits for QRR reference type',
        })
      }
      break
    case 'SCOR': {
      const length = charLength(ref)
      if (length < 5 || length > 25) {
        errs.push({
          field: 'reference',
          message: 'must be 5-25 characters for SCOR reference type (ISO 11649)',
        })
      }
      break
    }
    default:
      errs.push({
        field: 'referenceType',
        message: 'must be QRR, SCOR, or NON',
      })
  }
  return errs
}

/**
 * CORRECTION 3: banks reject a bill whose reference type does not match the
 * kind of IBAN it is drawn on. Absent from the Go entirely.
 *
 * Only checked once the IBAN is structurally sound — otherwise a typo in the
 * IBAN would produce a second, misleading error about the reference type.
 */
function validateIBANReferencePairing(
  iban: string,
  refType: string,
  errs: ValidationError[],
): ValidationError[] {
  const cleaned = normalizeIBAN(iban ?? '')
  if (!ibanRegex.test(cleaned)) return errs

  const effectiveType = refType === '' ? 'NON' : refType
  if (effectiveType !== 'QRR' && effectiveType !== 'SCOR' && effectiveType !== 'NON') {
    return errs
  }

  if (isQRIban(cleaned)) {
    if (effectiveType !== 'QRR') {
      errs.push({
        field: 'referenceType',
        message: 'must be QRR when the creditor IBAN is a QR-IBAN',
      })
    }
  } else if (effectiveType === 'QRR') {
    errs.push({
      field: 'referenceType',
      message: 'must be NON or SCOR when the creditor IBAN is not a QR-IBAN',
    })
  }
  return errs
}
