import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/svelte'
import { createRawSnippet } from 'svelte'
import Sheet from './Sheet.svelte'

/**
 * The one thing about a sheet that no caller can be expected to get right.
 *
 * A sheet covers the screen, and is opened from wherever its trigger happens
 * to live. Two ordinary declarations on an ancestor take it apart, and both
 * were true of the action dial at once:
 *
 *   .dial, .strip { pointer-events: none }      /* taps fall through *​/
 *   .dial          { z-index: 41 }              /* a stacking context *​/
 *
 * The budget switcher opened a sheet from inside that, and the result was a
 * sheet that looked perfectly normal, could not be dismissed, and passed every
 * tap through to the navigation bar underneath — so choosing a budget actually
 * pressed *Accounts*. No z-index would have fixed it. The sheet has to leave
 * the subtree, which is what `portal` does and what this holds it to.
 */
const body = createRawSnippet(() => ({ render: () => '<p>inside</p>' }))

beforeEach(cleanup)

describe('a sheet leaves whatever opened it', () => {
  test('is a child of body, not of the element that rendered it', () => {
    const { container } = render(Sheet, {
      props: { label: 'Pick one', onclose: vi.fn(), children: body },
    })

    const surface = screen.getByRole('dialog')
    expect(container.contains(surface)).toBe(false)
    expect(surface.closest('.backdrop')?.parentElement).toBe(document.body)
  })

  test('takes itself away again when it closes', () => {
    const view = render(Sheet, {
      props: { label: 'Pick one', onclose: vi.fn(), children: body },
    })
    expect(document.body.querySelector('.backdrop')).toBeTruthy()

    view.unmount()

    // Parked on `body` rather than in its own component's subtree, so nothing
    // else would have removed it.
    expect(document.body.querySelector('.backdrop')).toBeNull()
  })
})
