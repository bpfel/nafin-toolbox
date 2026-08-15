// Pure SVG renderer for a Swiss QR code.
//
// Ported from the Go implementation preserved in plans/qrbill-feature-snapshot.md
// (backend/internal/qrbill/svg.go).
//
// This module deliberately knows nothing about QR encoding. It takes an already
// computed module matrix so it stays trivially testable and dependency-free.
//
// --- Why there is no Swiss cross ------------------------------------------
//
// IG v2.3 section 6.4.2 says the printed code is overlaid with a black-and-white
// cross logo measuring 7 x 7 mm. We deliberately do not draw one.
//
// It is a *recognition* symbol, not encoded data: scanners read the payload,
// which begins "SPC", and never look at the image. Overlaying the cross actively
// destroys modules, which is part of why error correction level M is mandated —
// so a code without it scans strictly better than one with it.
//
// A hand-drawn approximation would be the worst of the three options. The
// standard publishes only the 7 mm outer dimension and distributes the glyph
// itself as a file from the SIX Download Centre, so the inner proportions cannot
// be derived from the document; and page 5 records the image as legally
// protected by SIC Ltd. An eyeballed reconstruction is therefore both inaccurate
// and someone else's IP, while damaging the symbol into the bargain.
//
// To add it properly: fetch the official logo from the SIX Download Centre, embed
// it as inline SVG, and centre it at 7/46 of the code width (not of the canvas —
// the canvas includes the quiet zone). That is a compliance requirement for
// issuing QR-bills to other people, not a functional one for scanning.

// Quiet zone required around the symbol, in modules.
const QUIET_ZONE = 4

// Default edge length of one module, in SVG user units.
const DEFAULT_MODULE_SIZE = 10

// The Swiss QR code is printed at 46 x 46 mm.
const CODE_WIDTH_MM = 46

export interface RenderQRSvgOptions {
  moduleSize?: number
}

// Formats a number for SVG output: rounded to 3 decimals, no trailing zeros.
function num(value: number): string {
  return String(Math.round(value * 1000) / 1000)
}

/**
 * Renders a QR module matrix as a standalone SVG string.
 *
 * `matrix[y][x] === true` means that module is black. The matrix must be
 * square-ish and non-empty; the quiet zone is added by this function, so pass
 * a matrix without one (the Go original sets `DisableBorder` for the same
 * reason).
 *
 * The symbol is emitted at 46 x 46 mm regardless of QR version: the viewBox
 * describes the module grid and the width/height attributes fix the physical
 * size.
 */
export function renderQRSvg(matrix: boolean[][], opts: RenderQRSvgOptions = {}): string {
  const moduleSize = opts.moduleSize ?? DEFAULT_MODULE_SIZE
  if (matrix.length === 0 || matrix[0].length === 0) {
    throw new Error('renderQRSvg: matrix must not be empty')
  }
  if (moduleSize <= 0) {
    throw new Error('renderQRSvg: moduleSize must be positive')
  }

  const modules = matrix.length
  const totalModules = modules + 2 * QUIET_ZONE
  const size = totalModules * moduleSize

  // IG v2.3 section 6.4: the 46 x 46 mm applies to the code "without surrounding
  // quiet space". The viewBox spans code *plus* quiet zone, so the physical width
  // must be scaled up in the same proportion — otherwise the code itself prints
  // at 46 * modules / totalModules mm, roughly 12% undersized for a typical
  // version 10 symbol, in breach of the standard.
  const canvasMm = (CODE_WIDTH_MM * totalModules) / modules

  const parts: string[] = []
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${num(canvasMm)}mm" height="${num(canvasMm)}mm" viewBox="0 0 ${num(size)} ${num(size)}">`,
  )
  parts.push(`<rect x="0" y="0" width="${num(size)}" height="${num(size)}" fill="white"/>`)

  parts.push('<g class="qr-modules">')
  for (let y = 0; y < modules; y++) {
    const row = matrix[y]
    for (let x = 0; x < row.length; x++) {
      if (!row[x]) continue
      const px = (x + QUIET_ZONE) * moduleSize
      const py = (y + QUIET_ZONE) * moduleSize
      parts.push(
        `<rect class="qr-module" x="${num(px)}" y="${num(py)}" width="${num(moduleSize)}" height="${num(moduleSize)}" fill="black"/>`,
      )
    }
  }
  parts.push('</g>')
  parts.push('</svg>')

  return parts.join('')
}
