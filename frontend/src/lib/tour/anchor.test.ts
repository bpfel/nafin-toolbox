import { describe, test, expect, afterEach } from 'vitest'
import {
  anchorRect,
  anchorElement,
  needsScroll,
  placeCard,
  phonePlacement,
  scrollAdjustment,
} from './anchor'

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

  /**
   * A budget type is its heading *and* a row underneath it, which cannot share
   * a wrapper: one is a div, the other a tr. They are vertically adjacent, so
   * the union is the band between them.
   */
  test('spans everything wearing the name', () => {
    el('type-bill', { top: 100, bottom: 130, left: 20, right: 400, width: 380, height: 30 })
    el('type-bill', { top: 150, bottom: 190, left: 20, right: 420, width: 400, height: 40 })

    const rect = anchorRect('type-bill')!

    expect(rect.top).toBe(100)
    expect(rect.bottom).toBe(190)
    expect(rect.left).toBe(20)
    expect(rect.right).toBe(420)
  })

  test('a copy with no box does not stretch the union', () => {
    // The dial case: one element has geometry at this width and the other
    // does not, so the union must be the one that does — not a band reaching
    // back to the origin.
    el('dial', { width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0 })
    el('dial', { top: 140, bottom: 184, left: 190, right: 1010, width: 820, height: 44 })

    const rect = anchorRect('dial')!

    expect(rect.top).toBe(140)
    expect(rect.left).toBe(190)
  })

  test('a hidden copy does not stretch the union either', () => {
    el('type-bill', { top: 900, bottom: 940, left: 0, right: 500, width: 500, height: 40 }, false)
    el('type-bill', { top: 100, bottom: 130, left: 20, right: 400, width: 380, height: 30 })

    const rect = anchorRect('type-bill')!

    expect(rect.bottom).toBe(130)
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

describe('where the callout sits on a phone, and how big it may be', () => {
  const PHONE = { viewportHeight: 640, navHeight: 60, gap: 12, minHeight: 140 }

  /**
   * Both regressions from walking it on a phone. First the card was pinned
   * to the foot and sat over the navigation bar and the dial's dot; then,
   * moved to the far end, a long card simply grew back across the screen
   * into the halo — which is what the screenshot of step 5.4 showed, the
   * card covering the section heading it had just ringed.
   */
  test('moves to the top when the anchor is at the foot', () => {
    const nav = rectOf({ top: 566, bottom: 638, height: 72 })

    expect(phonePlacement({ rect: nav, ...PHONE }).atTop).toBe(true)
  })

  test('stays at the foot for an anchor high up the page', () => {
    const high = rectOf({ top: 100, bottom: 160, height: 60 })

    expect(phonePlacement({ rect: high, ...PHONE }).atTop).toBe(false)
  })

  test('never grows past the gap it was put in', () => {
    // Step 5.4: a two-paragraph guide, and a halo covering a heading and a
    // row. The card goes above it and must stop there.
    const halo = rectOf({ top: 408, bottom: 520, height: 112 })

    const { atTop, maxHeight } = phonePlacement({ rect: halo, ...PHONE })

    expect(atTop).toBe(true)
    expect(maxHeight).toBeLessThanOrEqual(halo.top)
  })

  test('the gap below is measured from above the navigation, not the screen edge', () => {
    const halo = rectOf({ top: 40, bottom: 100, height: 60 })

    const { atTop, maxHeight } = phonePlacement({ rect: halo, ...PHONE })

    expect(atTop).toBe(false)
    // 640 - 60 nav - 100 bottom - 24 gaps. A card sized to the screen edge
    // would put its buttons behind the navigation bar.
    expect(maxHeight).toBe(456)
  })

  test('a cramped gap still leaves a readable card', () => {
    // Nothing fits: a card that can be scrolled beats a correct one nobody
    // can read, and this is the only case where an overlap remains possible.
    const huge = rectOf({ top: 20, bottom: 600, height: 580 })

    expect(phonePlacement({ rect: huge, ...PHONE }).maxHeight).toBe(PHONE.minHeight)
  })

  test('with nothing to point at, the card has the screen above the navigation', () => {
    const { atTop, maxHeight } = phonePlacement({ rect: null, ...PHONE })

    expect(atTop).toBe(false)
    expect(maxHeight).toBe(556)
  })
})

/**
 * Moving the page so the callout fits beside the halo.
 *
 * Bounding the card to its gap stopped it overlapping the halo, but turned a
 * long step into a card that scrolls inside itself — which hides half of what
 * it says behind a gesture nobody thinks to make. Usually the page just needs
 * to move a little.
 */
describe('nudging the page to make room', () => {
  const PHONE = { viewportHeight: 640, navHeight: 60, gap: 12 }

  test('does nothing when the card already fits', () => {
    const halo = rectOf({ top: 420, bottom: 520, height: 100 })

    expect(scrollAdjustment({ rect: halo, cardHeight: 200, ...PHONE })).toBe(0)
  })

  /**
   * Step 5.4, the case that was reported: the bill guide is two paragraphs,
   * the halo covers a heading and a row, and centring left 396px above for a
   * card wanting 430.
   */
  test('scrolls up, moving the anchor down, when the card goes above', () => {
    const halo = rectOf({ top: 420, bottom: 520, height: 100 })

    const delta = scrollAdjustment({ rect: halo, cardHeight: 430, ...PHONE })

    // Negative: the page scrolls up so the ringed thing sits lower.
    expect(delta).toBeLessThan(0)
    // And by exactly the shortfall, not a guess.
    expect(delta).toBe(396 - 430)
  })

  test('scrolls down, moving the anchor up, when the card goes below', () => {
    const halo = rectOf({ top: 40, bottom: 120, height: 80 })

    const delta = scrollAdjustment({ rect: halo, cardHeight: 500, ...PHONE })

    expect(delta).toBeGreaterThan(0)
    expect(delta).toBe(500 - 436)
  })

  test('the nudge is exactly enough, so the card then fits', () => {
    const halo = rectOf({ top: 420, bottom: 520, height: 100 })
    const cardHeight = 430

    const delta = scrollAdjustment({ rect: halo, cardHeight, ...PHONE })
    // Scrolling by `delta` moves the anchor by `-delta`.
    const moved = rectOf({ top: halo.top - delta, bottom: halo.bottom - delta, height: 100 })

    const after = phonePlacement({ rect: moved, ...PHONE, minHeight: 140 })
    expect(after.maxHeight).toBeGreaterThanOrEqual(cardHeight)
    expect(scrollAdjustment({ rect: moved, cardHeight, ...PHONE })).toBe(0)
  })
})

/**
 * When the card is capped at all.
 *
 * A scrollbar on a card with nothing hidden sends the reader looking for
 * something that is not there, so the cap is left off unless it is earned.
 */
describe('deciding whether the callout needs to scroll', () => {
  test('content that fits is not capped', () => {
    expect(needsScroll(200, 400)).toBe(false)
  })

  test('content that does not fit is', () => {
    expect(needsScroll(500, 400)).toBe(true)
  })

  /**
   * The case the tolerance exists for. Rects come in fractions, so a card
   * 396.4px tall inside a 396px box scrolls — showing a scrollbar to hide
   * four tenths of a pixel.
   */
  test('a sub-pixel difference is not a reason to scroll', () => {
    expect(needsScroll(396.4, 396)).toBe(false)
  })

  test('exactly equal is not a reason either', () => {
    expect(needsScroll(400, 400)).toBe(false)
  })
})
