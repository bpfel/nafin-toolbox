import type { QRBillRequest } from './types'
import { normalizeIBAN } from './validate'

/**
 * Builds the SPC v2.3 payload: a 31-line newline-delimited string with no
 * trailing newline. Direct port of `BuildPayload` in payload.go.
 *
 * Line layout:
 *
 *    0: SPC (header)
 *    1: 0200 (version)
 *    2: 1 (coding type = UTF-8)
 *    3: Creditor IBAN
 *    4-10: Creditor address (type S + 6 fields)
 *   11-17: Ultimate creditor (7 empty lines — reserved)
 *   18: Amount (or empty)
 *   19: Currency
 *   20-26: Debtor address (type S + 6 fields, or 7 empty lines)
 *   27: Reference type
 *   28: Reference
 *   29: Additional info
 *   30: EPD (trailer)
 */
export function buildPayload(req: QRBillRequest): string {
  const lines: string[] = new Array(31).fill('')

  // Header
  lines[0] = 'SPC'
  lines[1] = '0200'
  lines[2] = '1'

  // Creditor IBAN, unspaced, by the same rule validation used
  lines[3] = normalizeIBAN(req.iban)

  // Creditor address (structured: type S)
  lines[4] = 'S'
  lines[5] = req.creditor.name
  lines[6] = req.creditor.street
  lines[7] = req.creditor.buildingNumber
  lines[8] = req.creditor.postalCode
  lines[9] = req.creditor.city
  lines[10] = req.creditor.country

  // Ultimate creditor — reserved, lines 11-17 stay empty

  // Amount + Currency
  lines[18] = req.amount ?? ''
  lines[19] = req.currency

  // Debtor address (or 7 empty lines)
  if (req.debtor) {
    lines[20] = 'S'
    lines[21] = req.debtor.name
    lines[22] = req.debtor.street
    lines[23] = req.debtor.buildingNumber
    lines[24] = req.debtor.postalCode
    lines[25] = req.debtor.city
    lines[26] = req.debtor.country
  }

  // Reference
  lines[27] = req.referenceType || 'NON'
  lines[28] = req.reference ?? ''

  // Additional info
  lines[29] = req.additionalInfo ?? ''

  // Trailer
  lines[30] = 'EPD'

  return lines.join('\n')
}
