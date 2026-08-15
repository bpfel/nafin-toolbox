// Pure SVG renderer for a Swiss QR code.
//
// Ported from the Go implementation preserved in plans/qrbill-feature-snapshot.md
// (backend/internal/qrbill/svg.go), with the Swiss cross overlay added — the Go
// original omits it, and the standard requires it.
//
// This module deliberately knows nothing about QR encoding. It takes an already
// computed module matrix so it stays trivially testable and dependency-free.

// Quiet zone required around the symbol, in modules.
const QUIET_ZONE = 4

// Default edge length of one module, in SVG user units.
const DEFAULT_MODULE_SIZE = 10

// The Swiss QR code is printed at 46 x 46 mm.
const CODE_WIDTH_MM = 46

// --- Swiss cross geometry -------------------------------------------------
//
// Verified against SIX "Swiss Implementation Guidelines for the QR-bill" v2.3,
// section 6.4.2 "Recognition symbol": the code is overlaid with a black-and-
// white cross logo measuring 7 x 7 mm. That is the ONLY dimension the standard
// publishes — it distributes the logo as a file from the SIX Download Centre
// rather than specifying its internal proportions.
//
// !!! PLACEHOLDER GLYPH — the 7 mm outer size is authoritative; the inner
// subdivisions below are approximations and cannot be corrected from the
// document, because the document does not contain them. Before shipping,
// replace renderSwissCross's inner shapes with the official SIX asset embedded
// as inline SVG. Note also that IG v2.3 page 5 records the cross image as
// legally protected by SIC Ltd, so an eyeballed reconstruction is the wrong
// artefact on both accuracy and licensing grounds.
//
// Ratios are millimetres over the 46 mm code width.
const CROSS_SIZE_RATIO = 7 / CODE_WIDTH_MM // 7 mm — IG v2.3 section 6.4.2
const CROSS_BLACK_INSET_RATIO = 0.7 / CODE_WIDTH_MM // approximation
const CROSS_ARM_LENGTH_RATIO = 3.9 / CODE_WIDTH_MM // approximation
const CROSS_ARM_WIDTH_RATIO = 1.17 / CODE_WIDTH_MM // approximation

export interface RenderQRSvgOptions {
  moduleSize?: number
}

// Formats a number for SVG output: rounded to 3 decimals, no trailing zeros.
function num(value: number): string {
  return String(Math.round(value * 1000) / 1000)
}

function rect(x: number, y: number, width: number, height: number, fill: string): string {
  return `<rect x="${num(x)}" y="${num(y)}" width="${num(width)}" height="${num(height)}" fill="${fill}"/>`
}

// Renders the Swiss cross overlay, centred on the code area.
//
// Three stacked shapes, per the standard's appearance: a white backing square,
// a black square inset within it, and a white cross centred in the black
// square (drawn as two overlapping arms).
function renderSwissCross(centre: number, codeWidth: number): string {
  const crossSize = codeWidth * CROSS_SIZE_RATIO
  const blackSize = crossSize - 2 * (codeWidth * CROSS_BLACK_INSET_RATIO)
  const armLength = codeWidth * CROSS_ARM_LENGTH_RATIO
  const armWidth = codeWidth * CROSS_ARM_WIDTH_RATIO

  const parts = [
    rect(centre - crossSize / 2, centre - crossSize / 2, crossSize, crossSize, 'white'),
    rect(centre - blackSize / 2, centre - blackSize / 2, blackSize, blackSize, 'black'),
    rect(centre - armLength / 2, centre - armWidth / 2, armLength, armWidth, 'white'),
    rect(centre - armWidth / 2, centre - armLength / 2, armWidth, armLength, 'white'),
  ]

  return `<g class="swiss-cross">${parts.join('')}</g>`
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
  const codeWidth = modules * moduleSize

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

  parts.push(renderSwissCross(size / 2, codeWidth))
  parts.push('</svg>')

  return parts.join('')
}
