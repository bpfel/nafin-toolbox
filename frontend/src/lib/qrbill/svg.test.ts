import { describe, test, expect } from 'vitest'
import { renderQRSvg } from './svg'

const QUIET_ZONE = 4

// Builds a square matrix from a predicate over (x, y).
function matrixOf(size: number, fn: (x: number, y: number) => boolean): boolean[][] {
  return Array.from({ length: size }, (_, y) =>
    Array.from({ length: size }, (_, x) => fn(x, y)),
  )
}

function countTrue(matrix: boolean[][]): number {
  return matrix.reduce((sum, row) => sum + row.filter(Boolean).length, 0)
}

function parse(svg: string): SVGSVGElement {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml')
  const errors = doc.getElementsByTagName('parsererror')
  expect(errors.length).toBe(0)
  return doc.documentElement as unknown as SVGSVGElement
}

function moduleRects(svg: string): Element[] {
  return Array.from(parse(svg).querySelectorAll('rect.qr-module'))
}

function attrNum(el: Element, name: string): number {
  return Number(el.getAttribute(name))
}

// A small matrix with black modules in every corner, so the quiet zone can be
// measured from the extremes.
const cornerMatrix: boolean[][] = matrixOf(
  5,
  (x, y) => (x === 0 || x === 4) && (y === 0 || y === 4),
)

// A checkerboard standing in for a realistic version-10-ish symbol.
const largeMatrix: boolean[][] = matrixOf(57, (x, y) => (x + y) % 2 === 0)

describe('renderQRSvg — module rendering', () => {
  test('emits one black rect per true cell', () => {
    const rects = moduleRects(renderQRSvg(cornerMatrix))

    expect(rects.length).toBe(countTrue(cornerMatrix))
    expect(rects.length).toBe(4)
  })

  test('emits one black rect per true cell for a large matrix', () => {
    const rects = moduleRects(renderQRSvg(largeMatrix))

    expect(rects.length).toBe(countTrue(largeMatrix))
  })

  test('emits no module rects for an all-false matrix', () => {
    const blank = matrixOf(5, () => false)

    expect(moduleRects(renderQRSvg(blank)).length).toBe(0)
  })

  test('every module rect is black and one module square', () => {
    const rects = moduleRects(renderQRSvg(cornerMatrix, { moduleSize: 4 }))

    for (const r of rects) {
      expect(r.getAttribute('fill')).toBe('black')
      expect(attrNum(r, 'width')).toBe(4)
      expect(attrNum(r, 'height')).toBe(4)
    }
  })

  test('places modules at matrix position offset by the quiet zone', () => {
    const single = matrixOf(3, (x, y) => x === 1 && y === 2)
    const rects = moduleRects(renderQRSvg(single, { moduleSize: 10 }))

    expect(rects.length).toBe(1)
    expect(attrNum(rects[0], 'x')).toBe((1 + QUIET_ZONE) * 10)
    expect(attrNum(rects[0], 'y')).toBe((2 + QUIET_ZONE) * 10)
  })
})

describe('renderQRSvg — quiet zone', () => {
  test('leaves 4 modules of white on all four sides', () => {
    const moduleSize = 10
    const svg = renderQRSvg(cornerMatrix, { moduleSize })
    const rects = moduleRects(svg)
    const size = parse(svg).getAttribute('viewBox')!.split(' ').map(Number)[2]

    const minX = Math.min(...rects.map(r => attrNum(r, 'x')))
    const minY = Math.min(...rects.map(r => attrNum(r, 'y')))
    const maxX = Math.max(...rects.map(r => attrNum(r, 'x') + attrNum(r, 'width')))
    const maxY = Math.max(...rects.map(r => attrNum(r, 'y') + attrNum(r, 'height')))

    expect(minX).toBe(QUIET_ZONE * moduleSize)
    expect(minY).toBe(QUIET_ZONE * moduleSize)
    expect(size - maxX).toBe(QUIET_ZONE * moduleSize)
    expect(size - maxY).toBe(QUIET_ZONE * moduleSize)
  })

  test('viewBox spans the matrix plus a quiet zone on both sides', () => {
    const moduleSize = 10
    const svg = renderQRSvg(largeMatrix, { moduleSize })
    const viewBox = parse(svg).getAttribute('viewBox')
    const expected = (57 + 2 * QUIET_ZONE) * moduleSize

    expect(viewBox).toBe(`0 0 ${expected} ${expected}`)
  })

  test('has a white background rect covering the whole viewBox', () => {
    const svg = renderQRSvg(cornerMatrix, { moduleSize: 10 })
    const size = (5 + 2 * QUIET_ZONE) * 10
    const bg = parse(svg).querySelector('rect[fill="white"]')!

    expect(attrNum(bg, 'x')).toBe(0)
    expect(attrNum(bg, 'y')).toBe(0)
    expect(attrNum(bg, 'width')).toBe(size)
    expect(attrNum(bg, 'height')).toBe(size)
  })
})

describe('renderQRSvg — Swiss cross', () => {
  test('includes a Swiss cross group', () => {
    const cross = parse(renderQRSvg(cornerMatrix)).querySelector('g.swiss-cross')

    expect(cross).not.toBeNull()
  })

  test('every cross shape is centred on the symbol', () => {
    for (const matrix of [cornerMatrix, largeMatrix]) {
      const svg = renderQRSvg(matrix, { moduleSize: 10 })
      const size = (matrix.length + 2 * QUIET_ZONE) * 10
      const centre = size / 2
      const shapes = Array.from(parse(svg).querySelectorAll('g.swiss-cross rect'))

      expect(shapes.length).toBeGreaterThan(0)
      for (const s of shapes) {
        // Coordinates are emitted rounded to 3 decimals, so centring holds to
        // within that rounding, not to the last bit of a float.
        expect(attrNum(s, 'x') + attrNum(s, 'width') / 2).toBeCloseTo(centre, 2)
        expect(attrNum(s, 'y') + attrNum(s, 'height') / 2).toBeCloseTo(centre, 2)
      }
    }
  })

  test('is a white square, a black square inset in it, then a white cross', () => {
    const shapes = Array.from(
      parse(renderQRSvg(cornerMatrix)).querySelectorAll('g.swiss-cross rect'),
    )

    expect(shapes.map(s => s.getAttribute('fill'))).toEqual(['white', 'black', 'white', 'white'])

    const [outer, inner, horizontal, vertical] = shapes
    expect(attrNum(inner, 'width')).toBeLessThan(attrNum(outer, 'width'))
    expect(attrNum(horizontal, 'width')).toBeLessThan(attrNum(inner, 'width'))
    expect(attrNum(horizontal, 'width')).toBeGreaterThan(attrNum(horizontal, 'height'))
    expect(attrNum(vertical, 'height')).toBeGreaterThan(attrNum(vertical, 'width'))
    expect(attrNum(horizontal, 'width')).toBeCloseTo(attrNum(vertical, 'height'), 6)
  })

  test('cross scales with the code width: 7/46 of it at any version', () => {
    for (const matrix of [cornerMatrix, largeMatrix]) {
      const moduleSize = 10
      const codeWidth = matrix.length * moduleSize
      const outer = parse(renderQRSvg(matrix, { moduleSize })).querySelector('g.swiss-cross rect')!

      expect(attrNum(outer, 'width')).toBeCloseTo((codeWidth * 7) / 46, 3)
      expect(attrNum(outer, 'height')).toBeCloseTo((codeWidth * 7) / 46, 3)
    }
  })
})

describe('renderQRSvg — physical size', () => {
  // IG v2.3 section 6.4: the 46 x 46 mm applies to the code "without surrounding
  // quiet space". The canvas therefore measures more than 46 mm, and it is the
  // code portion that must land exactly on 46 mm. Asserting the raw width
  // attribute would pin the wrong quantity and hide an undersized symbol.
  function codeWidthMm(svgText: string, modules: number): number {
    const svg = parse(svgText)
    const canvas = parseFloat(svg.getAttribute('width') ?? '')
    const height = parseFloat(svg.getAttribute('height') ?? '')
    expect(canvas).toBe(height)
    return (canvas * modules) / (modules + 8)
  }

  test('the code measures 46mm for a small matrix', () => {
    expect(codeWidthMm(renderQRSvg(cornerMatrix), 5)).toBeCloseTo(46, 3)
  })

  test('the code measures 46mm for a large matrix', () => {
    expect(codeWidthMm(renderQRSvg(largeMatrix), 57)).toBeCloseTo(46, 3)
  })

  test('the code stays 46mm when moduleSize changes', () => {
    expect(codeWidthMm(renderQRSvg(cornerMatrix, { moduleSize: 3 }), 5)).toBeCloseTo(46, 3)
  })

  test('the canvas exceeds 46mm, because the quiet zone sits outside the code', () => {
    const svg = parse(renderQRSvg(largeMatrix))
    expect(parseFloat(svg.getAttribute('width') ?? '')).toBeGreaterThan(46)
  })
})

describe('renderQRSvg — output shape', () => {
  test('starts with <svg and ends with </svg>', () => {
    const svg = renderQRSvg(largeMatrix)

    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg.endsWith('</svg>')).toBe(true)
  })

  test('is well-formed XML with the SVG namespace', () => {
    const root = parse(renderQRSvg(largeMatrix))

    expect(root.tagName).toBe('svg')
    expect(root.getAttribute('xmlns')).toBe('http://www.w3.org/2000/svg')
  })

  test('defaults to a module size of 10', () => {
    const svg = renderQRSvg(cornerMatrix)
    const rect = moduleRects(svg)[0]

    expect(attrNum(rect, 'width')).toBe(10)
    expect(parse(svg).getAttribute('viewBox')).toBe(`0 0 ${(5 + 8) * 10} ${(5 + 8) * 10}`)
  })

  test('is pure: the same input renders identically and the matrix is untouched', () => {
    const matrix = matrixOf(5, (x, y) => (x + y) % 3 === 0)
    const before = JSON.stringify(matrix)

    expect(renderQRSvg(matrix)).toBe(renderQRSvg(matrix))
    expect(JSON.stringify(matrix)).toBe(before)
  })

  test('rejects an empty matrix', () => {
    expect(() => renderQRSvg([])).toThrow(/empty/)
    expect(() => renderQRSvg([[]])).toThrow(/empty/)
  })

  test('rejects a non-positive module size', () => {
    expect(() => renderQRSvg(cornerMatrix, { moduleSize: 0 })).toThrow(/positive/)
  })
})
