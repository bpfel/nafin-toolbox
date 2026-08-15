// Swiss QR bill types — ported from backend/internal/qrbill/model.go
// (preserved in plans/qrbill-feature-snapshot.md).
//
// The Go structs carried snake_case JSON tags for an HTTP boundary that no
// longer exists: generation now happens entirely in the browser, so field
// names follow the frontend camelCase convention.

/** A structured (type "S") address as encoded in the SPC payload. */
export interface QRAddress {
  name: string
  street: string
  buildingNumber: string
  postalCode: string
  city: string
  country: string
}

/**
 * Reference type of the bill.
 * - `QRR`  — Swiss QR reference, 27 digits, only valid with a QR-IBAN
 * - `SCOR` — ISO 11649 creditor reference, only valid with a regular IBAN
 * - `NON`  — no reference
 */
export type ReferenceType = 'QRR' | 'SCOR' | 'NON'

export interface QRBillRequest {
  // Required
  iban: string
  creditor: QRAddress
  currency: 'CHF' | 'EUR'

  // Optional
  amount?: string
  debtor?: QRAddress
  referenceType?: ReferenceType
  reference?: string
  additionalInfo?: string
}

export interface ValidationError {
  field: string
  message: string
}
