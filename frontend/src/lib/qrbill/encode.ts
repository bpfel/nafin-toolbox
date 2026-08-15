import { encodeQR, utf8ToBytes } from 'qr'

/**
 * Quiet zone requested from the library, in modules.
 *
 * `encodeQR` refuses `border: 0` (it validates `border > 0`) and defaults to 2,
 * so the smallest border we can ask for is 1 — which we then strip again. The
 * matrix this module returns is the bare QR symbol: the Swiss QR bill spec
 * sizes the code itself at 46 x 46 mm and puts the quiet zone outside that, so
 * the quiet zone belongs to the SVG renderer, not to the module matrix.
 */
const REQUESTED_BORDER = 1

/**
 * Encode a Swiss QR bill payload into a QR module matrix.
 *
 * The only place the QR library is used. Callers get a square matrix indexed
 * `[row][column]`, where `true` is a dark module. No quiet zone is included.
 *
 * Both parameters the Swiss QR bill standard mandates are pinned explicitly
 * rather than left to the library's defaults or its mode auto-detection:
 * error correction level M (`ecc: 'medium'`) and byte mode with UTF-8
 * (`encoding: 'byte'` plus `textEncoder: utf8ToBytes`).
 *
 * @param payload - The 31-line SPC payload string.
 * @returns Square boolean matrix, `true` = dark module.
 */
export function encodeSwissQR(payload: string): boolean[][] {
  const withBorder = encodeQR(payload, 'raw', {
    ecc: 'medium',
    encoding: 'byte',
    textEncoder: utf8ToBytes,
    border: REQUESTED_BORDER,
  })
  const b = REQUESTED_BORDER
  return withBorder
    .slice(b, withBorder.length - b)
    .map((row) => row.slice(b, row.length - b))
}
