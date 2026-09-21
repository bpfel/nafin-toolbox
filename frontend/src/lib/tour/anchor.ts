/**
 * Finding the thing a tour step points at.
 *
 * `document.querySelector` is wrong here for two reasons, both of which showed
 * up the first time the tour was walked in a browser rather than in jsdom:
 *
 * 1. **The same anchor exists more than once.** The shell keeps Budget and
 *    Accounts both mounted and merely `hidden`, so that a tab switch does not
 *    throw away a half-typed amount. Every anchor inside a screen therefore
 *    appears twice, and the first in document order is not reliably the one on
 *    screen. The hidden copy measures 0×0, so the halo lands in the top-left
 *    corner of the window.
 *
 * 2. **An element can be real and still have no box.** `ActionDial` is
 *    `display: contents` above 768px — it exists, it is visible, and its
 *    `getBoundingClientRect` is all zeroes, because the box belongs to its
 *    children. Below 768px it is the fixed dot and has a box of its own.
 *
 * Both are answered by the same rule: among everything wearing the name, take
 * the first that is actually visible *and* has a box. That lets one anchor name
 * be put on two elements — the dial and the toolbar inside it — and resolve to
 * whichever of them the current width draws.
 */

/** Anything smaller than this is a layout artefact, not something to point at. */
const MIN_SIZE_PX = 1

function hasBox(rect: DOMRect): boolean {
  return rect.width >= MIN_SIZE_PX && rect.height >= MIN_SIZE_PX
}

/**
 * Whether the element is drawn at all.
 *
 * `checkVisibility` catches the cases a rect cannot — `visibility: hidden` and
 * `opacity: 0` both leave a box behind. Guarded because it is recent enough
 * that an older browser would throw rather than answer, and the rect test below
 * already excludes the case this exists to catch.
 */
function isVisible(element: Element): boolean {
  if (typeof element.checkVisibility !== 'function') return true
  return element.checkVisibility({ visibilityProperty: true, opacityProperty: true })
}

/**
 * The rect to draw a halo around, or null if this step has nothing to point at.
 *
 * Null is an ordinary answer, not an error: a step whose anchor is missing is
 * skipped, and a step with no anchor at all never asks.
 */
export function anchorRect(name: string, root: ParentNode = document): DOMRect | null {
  for (const element of root.querySelectorAll(`[data-tour="${name}"]`)) {
    if (!isVisible(element)) continue
    const rect = element.getBoundingClientRect()
    if (hasBox(rect)) return rect
  }
  return null
}

/** The element itself, for scrolling it into view before measuring. */
export function anchorElement(name: string, root: ParentNode = document): HTMLElement | null {
  for (const element of root.querySelectorAll<HTMLElement>(`[data-tour="${name}"]`)) {
    if (isVisible(element) && hasBox(element.getBoundingClientRect())) return element
  }
  return null
}

export interface Placement {
  top: number
  left: number
}

export interface PlacementInput {
  rect: DOMRect
  cardWidth: number
  cardHeight: number
  viewportWidth: number
  viewportHeight: number
  /** Room between the anchor and the halo drawn round it. */
  halo: number
  /** Smallest gap kept between the card and any edge of the screen. */
  gutter: number
}

/**
 * Where to put the callout on a wide screen.
 *
 * Below the anchor if it fits, above if not — and **beside** it if neither
 * does. That third case is not exotic: the navigation rail runs the full height
 * of the window, so "above" and "below" both mean "off the screen", and a card
 * clamped into the gutter lands squarely on top of the very thing it is
 * describing. Pointing at something and then covering it is worse than not
 * pointing at all.
 *
 * Beside means the roomier side, so a left-hand rail pushes the card right and
 * a right-hand control pulls it left.
 */
export function placeCard(input: PlacementInput): Placement {
  const { rect, cardWidth, cardHeight, viewportWidth, viewportHeight, halo, gutter } = input
  const gap = halo + 12

  const clamp = (value: number, max: number) => Math.min(Math.max(gutter, value), Math.max(gutter, max))

  const below = rect.bottom + gap
  const above = rect.top - gap - cardHeight

  if (below + cardHeight + gutter <= viewportHeight || above >= gutter) {
    const top = below + cardHeight + gutter <= viewportHeight ? below : above
    const left = clamp(
      rect.left + rect.width / 2 - cardWidth / 2,
      viewportWidth - cardWidth - gutter,
    )
    return { top, left }
  }

  // Neither: go beside it, on whichever side has more room.
  const roomRight = viewportWidth - rect.right
  const left =
    roomRight >= rect.left
      ? clamp(rect.right + gap, viewportWidth - cardWidth - gutter)
      : clamp(rect.left - gap - cardWidth, viewportWidth - cardWidth - gutter)

  const top = clamp(
    rect.top + rect.height / 2 - cardHeight / 2,
    viewportHeight - cardHeight - gutter,
  )
  return { top, left }
}

/**
 * Which end of a phone the callout sits at.
 *
 * It is pinned rather than floated below 768px — a card chasing a highlight
 * around a 320px screen ends up covering what it describes, and being always
 * fully readable in one known place is worth more than being adjacent.
 *
 * But the foot of the screen is also where the interesting chrome lives: the
 * navigation bar, and the dial's dot just above it. Both sit squarely under a
 * bottom-pinned card, so the tour rings something and then hides it. When the
 * anchor would fall behind the card, the card goes to the top instead — the
 * one place on a phone that is guaranteed to be clear of it.
 *
 * Unanchored steps stay at the foot, where the thumb is.
 */
export function phoneCardAtTop(input: {
  rect: DOMRect | null
  cardHeight: number
  viewportHeight: number
  /** Height of the fixed navigation the card is pinned above. */
  navHeight: number
  gap: number
}): boolean {
  const { rect, cardHeight, viewportHeight, navHeight, gap } = input
  if (!rect) return false
  const cardTop = viewportHeight - navHeight - gap - cardHeight
  // Overlap in the vertical axis is enough: the card runs the full width.
  return rect.bottom > cardTop && rect.top < viewportHeight
}
