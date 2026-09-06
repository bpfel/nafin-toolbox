import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { swipeHorizontal } from './swipe'

/**
 * The swipe's whole job is knowing when *not* to fire. A gesture that switches
 * views when someone meant to scroll is worse than no gesture: it moves the
 * page out from under a thumb that was reading.
 */

let node: HTMLElement
let onnext: () => void
let onprevious: () => void
let teardown: () => void

beforeEach(() => {
  node = document.createElement('div')
  document.body.appendChild(node)
  onnext = vi.fn()
  onprevious = vi.fn()
  teardown = swipeHorizontal(node, { onnext, onprevious }).destroy
})

afterEach(() => {
  teardown()
  node.remove()
})

function drag(
  from: { x: number; y: number },
  to: { x: number; y: number },
  options: { pointerType?: string; target?: HTMLElement } = {},
) {
  const pointerType = options.pointerType ?? 'touch'
  const target = options.target ?? node
  const fire = (type: string, x: number, y: number) =>
    target.dispatchEvent(
      new PointerEvent(type, { clientX: x, clientY: y, pointerType, bubbles: true }),
    )

  fire('pointerdown', from.x, from.y)
  // Two moves: the first crosses the slop and decides the axis, the second
  // carries it the rest of the way.
  const midX = from.x + (to.x - from.x) / 2
  const midY = from.y + (to.y - from.y) / 2
  fire('pointermove', midX, midY)
  fire('pointermove', to.x, to.y)
  fire('pointerup', to.x, to.y)
}

describe('a horizontal swipe', () => {
  test('goes forward when dragged left, back when dragged right', () => {
    drag({ x: 300, y: 200 }, { x: 200, y: 205 })
    expect(vi.mocked(onnext)).toHaveBeenCalledTimes(1)

    drag({ x: 200, y: 200 }, { x: 300, y: 205 })
    expect(vi.mocked(onprevious)).toHaveBeenCalledTimes(1)
  })

  test('a short drag is a slip of the thumb, not a swipe', () => {
    drag({ x: 300, y: 200 }, { x: 260, y: 200 })
    expect(vi.mocked(onnext)).not.toHaveBeenCalled()
  })
})

describe('what it declines to take', () => {
  test('a drag that is mostly vertical belongs to the page', () => {
    // The common case by far: someone scrolling a long screen with a thumb that
    // does not travel in a straight line.
    drag({ x: 300, y: 400 }, { x: 220, y: 120 })
    expect(vi.mocked(onnext)).not.toHaveBeenCalled()
  })

  test('a drag starting in a sideways scroller belongs to it', () => {
    const scroller = document.createElement('div')
    scroller.dataset.hscroll = ''
    node.appendChild(scroller)

    drag({ x: 300, y: 200 }, { x: 180, y: 200 }, { target: scroller })

    expect(vi.mocked(onnext)).not.toHaveBeenCalled()
  })

  test('a mouse is left alone', () => {
    // A pointer device has the tabs a click away, and a click-drag across a
    // page is how text gets selected.
    drag({ x: 300, y: 200 }, { x: 180, y: 200 }, { pointerType: 'mouse' })
    expect(vi.mocked(onnext)).not.toHaveBeenCalled()
  })

  test('and it stays declined once handed back', () => {
    // Having decided a drag was vertical, it must not change its mind when the
    // finger later wanders sideways.
    const fire = (type: string, x: number, y: number) =>
      node.dispatchEvent(
        new PointerEvent(type, { clientX: x, clientY: y, pointerType: 'touch', bubbles: true }),
      )

    fire('pointerdown', 300, 400)
    fire('pointermove', 302, 340)
    fire('pointermove', 150, 340)
    fire('pointerup', 150, 340)

    expect(vi.mocked(onnext)).not.toHaveBeenCalled()
  })
})
