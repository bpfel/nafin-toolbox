/**
 * A horizontal swipe that switches between two adjacent views.
 *
 * Thresholded rather than tracked: nothing follows the finger, and the view
 * changes on release if the drag went far enough. Tracking feels better and
 * costs a great deal more — both views laid out side by side and transformed
 * on every frame — and it is worth finding out whether the gesture is wanted
 * before paying for that.
 *
 * Three things it has to get right, and they are all about not stealing:
 *
 *  - **Direction lock.** A drag is claimed only once it has moved far enough to
 *    say which way it is going, and if that is vertical it is handed back. The
 *    page scrolls under a swipe that was mostly a scroll.
 *  - **Nested scrollers win.** A drag starting inside something that scrolls
 *    sideways belongs to it. Marked explicitly with `data-hscroll` rather than
 *    inferred from `scrollWidth`, because inference is right until a table is
 *    narrow enough not to overflow and then silently changes behaviour.
 *  - **Mice are left alone.** A pointer device has the tabs themselves, one
 *    click away, and a click-drag across a page is how text gets selected.
 */
interface SwipeOptions {
  /** Dragged leftwards: the next view, the way a page turns. */
  onnext?: () => void
  /** Dragged rightwards: the previous view. */
  onprevious?: () => void
}

/** Far enough to mean it. Below this a swipe is a slip of the thumb. */
const THRESHOLD_PX = 60

/** Far enough to have a direction at all. */
const SLOP_PX = 10

export function swipeHorizontal(node: HTMLElement, options: SwipeOptions) {
  let current = options
  let startX = 0
  let startY = 0
  let tracking = false
  let axis: 'x' | 'y' | null = null

  function down(event: PointerEvent) {
    if (event.pointerType === 'mouse') return
    if ((event.target as HTMLElement | null)?.closest('[data-hscroll]')) return

    startX = event.clientX
    startY = event.clientY
    tracking = true
    axis = null
  }

  function move(event: PointerEvent) {
    if (!tracking) return

    const dx = event.clientX - startX
    const dy = event.clientY - startY

    if (axis === null) {
      if (Math.abs(dx) < SLOP_PX && Math.abs(dy) < SLOP_PX) return
      axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
    }

    // Mostly vertical: not ours. Let go so the page scrolls unimpeded.
    if (axis === 'y') tracking = false
  }

  function up(event: PointerEvent) {
    if (!tracking) return
    tracking = false
    if (axis !== 'x') return

    const dx = event.clientX - startX
    if (dx <= -THRESHOLD_PX) current.onnext?.()
    else if (dx >= THRESHOLD_PX) current.onprevious?.()
  }

  function cancel() {
    tracking = false
  }

  node.addEventListener('pointerdown', down)
  node.addEventListener('pointermove', move)
  node.addEventListener('pointerup', up)
  node.addEventListener('pointercancel', cancel)
  node.addEventListener('pointerleave', cancel)

  return {
    update(next: SwipeOptions) {
      current = next
    },
    destroy() {
      node.removeEventListener('pointerdown', down)
      node.removeEventListener('pointermove', move)
      node.removeEventListener('pointerup', up)
      node.removeEventListener('pointercancel', cancel)
      node.removeEventListener('pointerleave', cancel)
    },
  }
}
