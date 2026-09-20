import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/svelte'
import { describe, test, expect, afterEach } from 'vitest'
import { createRawSnippet } from 'svelte'
import ActionDial from './ActionDial.svelte'
import { navigate } from './router.svelte'

/**
 * A stand-in for whatever a screen puts in its controls.
 *
 * Two of them, one of which is a toggle that is on — the shape the dial has to
 * cope with on Budget, where a "+" sits beside an Edit that may or may not be
 * switched on.
 */
const controls = createRawSnippet(() => ({
  render: () => `
    <span>
      <button class="action" aria-label="Add" title="Add"></button>
      <button class="action pressed" aria-label="Done" title="Done" aria-pressed="true"></button>
    </span>`,
}))

function open() {
  return fireEvent.click(screen.getByRole('button', { name: 'Actions' }))
}

afterEach(() => {
  cleanup()
  navigate('/')
})

describe('the dot', () => {
  test('starts folded away, and says what it will open', () => {
    render(ActionDial, { children: controls })

    const dot = screen.getByRole('button', { name: 'Actions' })
    expect(dot.getAttribute('aria-expanded')).toBe('false')

    // It has to name what it controls: the dot and the stack are siblings, so
    // nothing in the document structure says they belong together. The name is
    // generated rather than fixed, because the shell keeps two screens mounted
    // at once and two dials would otherwise answer to one id.
    const named = dot.getAttribute('aria-controls')
    expect(named).toBeTruthy()
    expect(document.getElementById(named as string)).toBeTruthy()
  })

  test('opens, and then offers to close', async () => {
    render(ActionDial, { children: controls })
    await open()

    const dot = screen.getByRole('button', { name: 'Close' })
    expect(dot.getAttribute('aria-expanded')).toBe('true')
  })

  test('puts the keyboard on the control nearest itself', async () => {
    // The stack is built bottom-up, so the first control in the document is the
    // one sitting closest to the thumb — and the one a keyboard should reach
    // first, rather than having to walk back through the page to find it.
    render(ActionDial, { children: controls })
    await open()

    await waitFor(() => {
      expect(document.activeElement?.getAttribute('aria-label')).toBe('Add')
    })
  })
})

describe('folding it away again', () => {
  test('Escape closes it and gives the keyboard back', async () => {
    render(ActionDial, { children: controls })
    await open()

    await fireEvent.keyDown(window, { key: 'Escape' })

    expect(screen.getByRole('button', { name: 'Actions' }).getAttribute('aria-expanded')).toBe(
      'false',
    )
    // Where it was before the dial opened, rather than at the top of the page.
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Actions')
  })

  test('a tap anywhere else closes it', async () => {
    // Deliberately invisible — see the component — so this layer is the only
    // thing standing between a tap on the page and the dial staying open.
    const { container } = render(ActionDial, { children: controls })
    expect(container.querySelector('.dismiss')).toBeNull()

    await open()

    const dismiss = container.querySelector('.dismiss')
    expect(dismiss).toBeTruthy()
    await fireEvent.click(dismiss as Element)

    expect(screen.getByRole('button', { name: 'Actions' })).toBeTruthy()
    expect(container.querySelector('.dismiss')).toBeNull()
  })

  test('so does arriving somewhere else', async () => {
    // Screens are not unmounted when the tab changes — they are hidden — so an
    // open dial would otherwise still be standing over a screen whose controls
    // it no longer holds.
    render(ActionDial, { children: controls })
    await open()

    navigate('/accounts')

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Actions' }).getAttribute('aria-expanded')).toBe(
        'false',
      )
    })
  })
})

describe('what the vault is doing', () => {
  test('is always somewhere to be read, so that it can be heard when it changes', async () => {
    // A live region is only announced while it is already in the document. One
    // that appears at the moment it has something to say is a status nobody
    // hears, which is why this element is there and empty the rest of the time.
    const { rerender } = render(ActionDial, { children: controls })

    const status = screen.getByRole('status')
    expect(status.textContent?.trim()).toBe('')

    await rerender({ children: controls, dirty: true })
    expect(status.textContent?.trim()).toBe('Unsaved')

    await rerender({ children: controls, dirty: true, saving: true })
    expect(status.textContent?.trim()).toBe('Saving...')
  })

  test('rides on the dot, which is all there is room for on a phone', async () => {
    // The ring is a CSS rule on these classes; what is asserted here is that
    // the dot is told, and that saving outranks unsaved rather than the two
    // being claimed at once.
    const { rerender } = render(ActionDial, { children: controls })

    const dot = screen.getByRole('button', { name: 'Actions' })
    expect(dot.className).not.toMatch(/dirty|saving/)

    await rerender({ children: controls, dirty: true })
    expect(dot.className).toMatch(/dirty/)

    await rerender({ children: controls, dirty: true, saving: true })
    expect(dot.className).toMatch(/saving/)
    expect(dot.className).not.toMatch(/dirty/)
  })
})
