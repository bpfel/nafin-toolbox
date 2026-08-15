import { describe, it, expect } from 'vitest'
import { Bitmap, utils, type ErrorCorrection } from 'qr'
import decodeQR from 'qr/decode.js'
import { encodeSwissQR } from './encode'
import encodeSource from './encode.ts?raw'

// A realistic 31-line SPC payload: header, creditor, ultimate creditor (empty),
// amount, ultimate debtor, reference, unstructured message, EPD trailer.
const swissPayload = [
  'SPC', // 1  QRType
  '0200', // 2  Version
  '1', // 3  Coding type (UTF-8)
  'CH4431999123000889012', // 4  IBAN
  'S', // 5  Creditor address type
  'Robert Schneider AG', // 6  Creditor name
  'Rue du Lac', // 7  Street
  '1268', // 8  Building number
  '2501', // 9  Postal code
  'Biel', // 10 Town
  'CH', // 11 Country
  '', // 12 Ultimate creditor address type
  '', // 13 Ultimate creditor name
  '', // 14
  '', // 15
  '', // 16
  '', // 17
  '', // 18 Ultimate creditor country
  '1949.75', // 19 Amount
  'CHF', // 20 Currency
  'S', // 21 Ultimate debtor address type
  'Pia-Maria Rutschmann-Schnyder', // 22 Ultimate debtor name
  'Grosse Marktgasse', // 23 Street
  '28', // 24 Building number
  '9400', // 25 Postal code
  'Rorschach', // 26 Town
  'CH', // 27 Country
  'QRR', // 28 Reference type
  '210000000003139471430009017', // 29 Reference
  'Instruction of 15.09.2019', // 30 Unstructured message
  'EPD', // 31 Trailer
].join('\n')

// Same shape, but with the Latin accented characters the Swiss character set
// permits in names, streets and towns.
const accentedPayload = swissPayload
  .replace('Robert Schneider AG', 'Zürcher Käserei & Söhne AG')
  .replace('Rue du Lac', 'Rue de la Forêt')
  .replace('Biel', 'Genève')
  .replace('Pia-Maria Rutschmann-Schnyder', 'Renée Müller-Häberli')
  .replace('Grosse Marktgasse', 'Grosse Marktgässli')
  .replace('Rorschach', 'Bärau')
  .replace('Instruction of 15.09.2019', 'Rückzahlung à Frau Müller, Nüsse & Öl')

/** Render a bare module matrix into an image a decoder can read. */
function toImage(bits: boolean[][]) {
  const bm = new Bitmap({ width: bits[0].length, height: bits.length }, bits)
  // The matrix carries no quiet zone by design, so add the ISO-mandated 4
  // modules here, and scale up so the detector has pixels to work with.
  return bm.border(4, false).scale(4).toImage()
}

/**
 * Does the symbol's function-pattern and format-information area agree with a
 * template drawn for this error correction level? The template leaves the data
 * region undefined, so only the fixed patterns and the format bits (which encode
 * the ECC level and the mask) are compared.
 */
function matchesTemplate(bits: boolean[][], ecc: ErrorCorrection, mask: number): boolean {
  const version = (bits.length - 17) / 4
  const tpl = utils.drawTemplate(version, ecc, mask as never)
  for (let y = 0; y < bits.length; y++) {
    for (let x = 0; x < bits.length; x++) {
      if (tpl.isDefined(x, y) && tpl.get(x, y) !== bits[y][x]) return false
    }
  }
  return true
}

const masks = [0, 1, 2, 3, 4, 5, 6, 7]

describe('encodeSwissQR', () => {
  it('returns a square boolean matrix for a 31-line Swiss payload', () => {
    expect(swissPayload.split('\n')).toHaveLength(31)

    const bits = encodeSwissQR(swissPayload)
    const size = bits.length

    expect(size).toBeGreaterThan(0)
    for (const row of bits) {
      expect(row).toHaveLength(size)
      for (const cell of row) expect(typeof cell).toBe('boolean')
    }
    // A bare QR symbol of version v is 21 + 4*(v-1) modules wide. Checking the
    // size lands on that grid proves no quiet zone slipped into the matrix.
    expect((size - 17) % 4).toBe(0)
    expect(size).toBeGreaterThanOrEqual(21)
    expect(size).toBeLessThanOrEqual(177)
    // At least some modules are dark.
    expect(bits.some((row) => row.includes(true))).toBe(true)
  })

  describe('mandated encoder settings are pinned explicitly', () => {
    it('passes ecc medium and byte/UTF-8 mode in the source, not by default', () => {
      expect(encodeSource).toContain("ecc: 'medium'")
      expect(encodeSource).toContain("encoding: 'byte'")
      expect(encodeSource).toContain('textEncoder: utf8ToBytes')
    })

    it('encodes error correction level M into the symbol format bits', () => {
      const bits = encodeSwissQR(swissPayload)

      // The format information is part of the symbol, so the level can be read
      // back: exactly the medium templates may match the generated code.
      const mediumMatches = masks.filter((m) => matchesTemplate(bits, 'medium', m))
      expect(mediumMatches).toHaveLength(1)

      for (const ecc of ['low', 'quartile', 'high'] as ErrorCorrection[]) {
        expect(masks.filter((m) => matchesTemplate(bits, ecc, m))).toHaveLength(0)
      }
    })

    it('encodes the payload as a byte-mode segment', () => {
      const bits = encodeSwissQR(swissPayload)
      const segments: { bytes: Uint8Array; eci?: number }[] = []

      // The decoder invokes textDecoder only for byte-mode segments, so being
      // called at all proves the payload went out in byte mode.
      decodeQR(toImage(bits), {
        textDecoder: (bytes: Uint8Array, eci?: number) => {
          segments.push({ bytes: Uint8Array.from(bytes), eci })
          return new TextDecoder('utf-8').decode(bytes)
        },
      })

      expect(segments).toHaveLength(1)
      expect(segments[0].eci).toBe(26) // ECI 26 = UTF-8
      expect(Array.from(segments[0].bytes)).toEqual(
        Array.from(new TextEncoder().encode(swissPayload))
      )
    })
  })

  describe('round trip', () => {
    it('decodes back to a byte-identical payload', () => {
      const decoded = decodeQR(toImage(encodeSwissQR(swissPayload)))

      expect(decoded).toBe(swissPayload)
      expect(decoded.split('\n')).toHaveLength(31)
      expect(Array.from(new TextEncoder().encode(decoded))).toEqual(
        Array.from(new TextEncoder().encode(swissPayload))
      )
    })

    it('preserves Latin accented characters', () => {
      expect(accentedPayload).toMatch(/[äöüéà]/)

      const decoded = decodeQR(toImage(encodeSwissQR(accentedPayload)))

      expect(decoded).toBe(accentedPayload)
      expect(decoded).toContain('Zürcher Käserei & Söhne AG')
      expect(decoded).toContain('Genève')
      expect(decoded).toContain('Rückzahlung à Frau Müller, Nüsse & Öl')
      expect(Array.from(new TextEncoder().encode(decoded))).toEqual(
        Array.from(new TextEncoder().encode(accentedPayload))
      )
    })
  })
})
