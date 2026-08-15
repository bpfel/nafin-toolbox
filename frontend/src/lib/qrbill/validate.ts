import type { QRAddress, QRBillRequest, ValidationError } from './types'
import { buildPayload } from './payload'

// Ported from backend/internal/qrbill/validate.go with three deliberate
// corrections, each marked CORRECTION below:
//   1. length limits count code points, not UTF-8 bytes (Go's len())
//   2. the mod-97 IBAN checksum uses an iterative remainder, not big.Int
//   3. the IBAN-kind / reference-type pairing rule is enforced (absent in Go)

// IG v2.3 page 35, confirmed by a live bank rejection: "The amount element is to
// be entered without leading zeroes, including decimal separators and two decimal
// places. Decimal, maximum 12-digits permitted, including decimal separators. Only
// decimal points (".") are permitted."
//
// So the two decimals are MANDATORY, not optional — '12' and '12.5' are both
// rejected by the bank — and leading zeros are forbidden, which is why the integer
// part is either a bare '0' or a digit string that cannot start with one. Nine
// integer digits plus '.' plus two decimals is exactly the 12-character maximum.
//
// The Go original had /^\d{1,9}(\.\d{1,2})?$/, which accepted all of '12', '12.5',
// '999999999' and '0012.50'. Every one of those produces a bill the bank refuses.
const amountRegex = /^(0|[1-9]\d{0,8})\.\d{2}$/
const ibanRegex = /^(CH|LI)\d{19}$/
const qrrRegex = /^\d{27}$/

// Per-field maxima from SIX IG v2.3, pages 34-35. Country is checked separately
// because it is an exact length, not a maximum.
const ADDRESS_MAX_LENGTHS: ReadonlyArray<[keyof QRAddress, number]> = [
  ['name', 70],
  ['street', 70],
  ['buildingNumber', 16],
  ['postalCode', 16],
  ['city', 35],
]

// IG v2.3 section 6.2: the encoded payload may not exceed 997 characters,
// including element separators. With the per-field maxima above the theoretical
// worst case is roughly 670, so this is a backstop rather than a live limit —
// but it is the rule the standard states, and it is what fails at the bank.
const MAX_PAYLOAD_CHARS = 997

// IG v2.3 page 35: the amount must be between 0.01 and 999,999,999.99.
const MIN_AMOUNT_CENTS = 1

/** Code point count. CORRECTION 1: Go's len() counted bytes, so "Müller" was 7. */
function charLength(s: string): number {
  return [...s].length
}

export function normalizeIBAN(iban: string): string {
  return iban.replace(/[\s'’]/g, '').toUpperCase()
}

export type IBANStatus = 'empty' | 'incomplete' | 'invalid' | 'valid'

/**
 * Live status for an IBAN field, for feedback while typing.
 *
 * Distinguishes "not finished yet" from "wrong" so the UI does not shout at a
 * user three characters into a 21-character identifier. Swiss and Liechtenstein
 * IBANs are always exactly 21 characters.
 */
export function ibanStatus(raw: string): IBANStatus {
  const cleaned = normalizeIBAN(raw)
  if (cleaned === '') return 'empty'
  // Anything that could not become a CH/LI IBAN is wrong straight away.
  if (!/^[A-Z]{0,2}[0-9]*$/.test(cleaned)) return 'invalid'
  if (cleaned.length < 21) return 'incomplete'
  if (!ibanRegex.test(cleaned)) return 'invalid'
  return validIBANChecksum(cleaned) ? 'valid' : 'invalid'
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
        message:
          'must have exactly 2 decimal places and no leading zeros, e.g. 12.50 — up to 9 digits before the point',
      })
    } else if (Math.round(parseFloat(req.amount) * 100) < MIN_AMOUNT_CENTS) {
      // A zero amount passes the regex but the standard requires at least 0.01.
      errs.push({ field: 'amount', message: 'must be at least 0.01' })
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

  // Checked last, and only on an otherwise valid request: building the payload
  // from a request that already failed field validation would report a length
  // problem on top of the real cause.
  if (errs.length === 0) {
    const payloadLength = charLength(buildPayload(req))
    if (payloadLength > MAX_PAYLOAD_CHARS) {
      errs.push({
        field: 'payload',
        message: `assembled payload is ${payloadLength} characters, exceeding the ${MAX_PAYLOAD_CHARS} character limit`,
      })
    }
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
  // Field lengths per SIX IG v2.3, "Data elements in the QR-bill" (pages 34-35).
  // The Go original only checked the name; the other four were unbounded, which
  // is what made the 997-character payload cap reachable at all.
  for (const [field, max] of ADDRESS_MAX_LENGTHS) {
    if (charLength(addr[field] ?? '') > max) {
      errs.push({ field: `${prefix}.${field}`, message: `must be at most ${max} characters` })
    }
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
