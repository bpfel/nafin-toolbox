import { describe, test, expect, afterEach } from 'vitest'
import { anchorRect, anchorElement, placeCard, phoneCardAtTop } from './anchor'

/**
 * Both halves of this file are regressions. Every case below was found by
 * walking the tour in a browser, and none of them could have been found in
 * jsdom, which reports every rect as zero — so the sizes here are stubbed onto
 * the elements rather than laid out.
 */

function el(name: string, rect: Partial<DOMRect>, visible = true): HTMLElement {
  const node = document.createElement('div')
  node.dataset.tour = name
  const full = { x: 0, y: 0, width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0, ...rect }
  node.getBoundingClientRect = () => full as DOMRect
  ;(node as unknown as { checkVisibility: () => boolean }).checkVisibility = () => visible
  document.body.append(node)
  return node
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('finding what a step points at', () => {
  /**
   * The shell keeps Budget and Accounts both mounted so a tab switch does not
   * throw away a half-typed amount, so every anchor inside a screen exists
   * twice. `querySelector` took the first and the halo landed in the corner.
   */
  test('skips the copy on the screen that is not showing', () => {
    el('dial', { width: 0, height: 0 }, false)
    const showing = el('dial', { width: 56, height: 64, top: 496, left: 412 })

    expect(anchorElement('dial')).toBe(showing)
    expect(anchorRect('dial')?.width).toBe(56)
  })

  /**
   * `ActionDial` is `display: contents` above 768px: visible, real, and with
   * no box of its own. The name is on the container and on the toolbar inside
   * it, and which one answers depends on the width.
   */
  test('skips a visible element that has no box', () => {
    el('dial', { width: 0, height: 0 })
    const toolbar = el('dial', { width: 820, height: 44, top: 140, left: 190 })

    expect(anchorElement('dial')).toBe(toolbar)
  })

  test('takes the first that is both visible and boxed', () => {
    const first = el('nav', { width: 190, height: 676 })
    el('nav', { width: 190, height: 676 })

    expect(anchorElement('nav')).toBe(first)
  })

  test('a name nothing wears resolves to nothing', () => {
    expect(anchorElement('absent')).toBeNull()
    expect(anchorRect('absent')).toBeNull()
  })

  test('an anchor that exists but is hidden resolves to nothing', () => {
    el('eye', { width: 44, height: 44 }, false)

    expect(anchorRect('eye')).toBeNull()
  })
})

const VIEWPORT = { viewportWidth: 1280, viewportHeight: 800, halo: 6, gutter: 16 }
const CARD = { cardWidth: 340, cardHeight: 200 }

function rectOf(r: Partial<DOMRect>): DOMRect {
  return { x: 0, y: 0, width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0, ...r } as DOMRect
}

describe('where the callout goes', () => {
  test('below the anchor when there is room', () => {
    const rect = rectOf({ top: 100, bottom: 144, left: 500, right: 700, width: 200, height: 44 })

    const { top } = placeCard({ rect, ...CARD, ...VIEWPORT })

    expect(top).toBeGreaterThan(rect.bottom)
  })

  test('above the anchor when there is not', () => {
    const rect = rectOf({ top: 640, bottom: 700, left: 500, right: 700, width: 200, height: 60 })

    const { top } = placeCard({ rect, ...CARD, ...VIEWPORT })

    expect(top + CARD.cardHeight).toBeLessThanOrEqual(rect.top)
  })

  /**
   * The case this function exists for. The navigation rail runs the full
   * height of the window, so above and below both mean off the screen — and
   * the card, clamped into the gutter, sat squarely on top of the rail it was
   * describing.
   */
  test('beside a full-height anchor, never on top of it', () => {
    const rail = rectOf({ top: 0, bottom: 800, left: 0, right: 190, width: 190, height: 800 })

    const { left, top } = placeCard({ rect: rail, ...CARD, ...VIEWPORT })

    expect(left).toBeGreaterThanOrEqual(rail.right)
    expect(top).toBeGreaterThanOrEqual(VIEWPORT.gutter)
    expect(top + CARD.cardHeight).toBeLessThanOrEqual(VIEWPORT.viewportHeight)
  })

  test('beside means the roomier side', () => {
    const onTheRight = rectOf({
      top: 0,
      bottom: 800,
      left: 1090,
      right: 1280,
      width: 190,
      height: 800,
    })

    const { left } = placeCard({ rect: onTheRight, ...CARD, ...VIEWPORT })

    expect(left + CARD.cardWidth).toBeLessThanOrEqual(onTheRight.left)
  })

  test('never leaves the screen, whatever the anchor does', () => {
    const offEdge = rectOf({ top: 10, bottom: 54, left: 1240, right: 1400, width: 160, height: 44 })

    const { left, top } = placeCard({ rect: offEdge, ...CARD, ...VIEWPORT })

    expect(left).toBeGreaterThanOrEqual(VIEWPORT.gutter)
    expect(left + CARD.cardWidth).toBeLessThanOrEqual(VIEWPORT.viewportWidth)
    expect(top).toBeGreaterThanOrEqual(VIEWPORT.gutter)
  })
})

describe('which end of a phone the callout sits at', () => {
  const PHONE = { cardHeight: 190, viewportHeight: 640, navHeight: 60, gap: 12 }

  /**
   * Both regressions from the first walk-through on a phone: the navigation
   * bar and the dial's dot each sat behind the bottom-pinned card, so the tour
   * drew a ring round something and then covered it up.
   */
  test('moves to the top when the anchor is the navigation bar', () => {
    const nav = rectOf({ top: 566, bottom: 638, height: 72 })

    expect(phoneCardAtTop({ rect: nav, ...PHONE })).toBe(true)
  })

  test('moves to the top when the anchor is the dial dot', () => {
    const dot = rectOf({ top: 490, bottom: 566, height: 76 })

    expect(phoneCardAtTop({ rect: dot, ...PHONE })).toBe(true)
  })

  test('stays at the foot for an anchor higher up the page', () => {
    const high = rectOf({ top: 100, bottom: 160, height: 60 })

    expect(phoneCardAtTop({ rect: high, ...PHONE })).toBe(false)
  })

  test('stays at the foot when there is nothing to point at', () => {
    expect(phoneCardAtTop({ rect: null, ...PHONE })).toBe(false)
  })
})
