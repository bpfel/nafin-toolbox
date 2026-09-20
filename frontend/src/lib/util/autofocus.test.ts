import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import { autofocus } from './autofocus'
import { focusTrap } from './focusTrap'

/**
 * The action's job is placing a caret, so the interesting cases are all the
 * times it must decline: a disabled field, a user who got there first, and a
 * caret that must not land on top of a figure the user meant to amend.
 */

let host: HTMLElement

beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
})

afterEach(() => {
  host.remove()
})

/** The action waits a frame; jsdom runs rAF on a timer, so wait for one. */
function nextFrame(): Promise<void> {
  return new Promise(resolve => requestAnimationFrame(() => resolve()))
}

function input(attrs: Partial<HTMLInputElement> = {}): HTMLInputElement {
  const el = document.createElement('input')
  Object.assign(el, { type: 'text', ...attrs })
  host.appendChild(el)
  return el
}

describe('autofocus', () => {
  test('focuses the field a frame after mount', async () => {
    const el = input()
    autofocus(el)
    expect(document.activeElement).not.toBe(el)

    await nextFrame()
    expect(document.activeElement).toBe(el)
  })

  test('leaves the caret after existing text rather than selecting it', async () => {
    const el = input({ value: '1234.50' })
    autofocus(el)
    await nextFrame()

    // Selecting would mean the first keystroke replaces the balance.
    expect(el.selectionStart).toBe(7)
    expect(el.selectionEnd).toBe(7)
  })

  test('declines a disabled field', async () => {
    const el = input({ disabled: true })
    autofocus(el)
    await nextFrame()

    expect(document.activeElement).not.toBe(el)
  })

  test('does not take focus from a field the user already chose', async () => {
    const chosen = input()
    const late = input()
    autofocus(late)
    chosen.focus()

    await nextFrame()
    expect(document.activeElement).toBe(chosen)
  })

  test('does not throw on an input type that has no text selection', async () => {
    const el = input({ type: 'date' })
    autofocus(el)
    await expect(nextFrame()).resolves.toBeUndefined()
    expect(document.activeElement).toBe(el)
  })

  test('cancels the pending focus when destroyed first', async () => {
    const el = input()
    autofocus(el).destroy()

    await nextFrame()
    expect(document.activeElement).not.toBe(el)
  })
})

describe('focusTrap honours the mark', () => {
  test('prefers a marked field over the first focusable element', async () => {
    const first = document.createElement('select')
    host.appendChild(first)
    const marked = input()
    autofocus(marked)

    focusTrap(host)
    await nextFrame()

    expect(document.activeElement).toBe(marked)
  })

  test('still falls back to the first focusable element when nothing is marked', async () => {
    const first = document.createElement('button')
    host.appendChild(first)
    input()

    focusTrap(host)
    await nextFrame()

    expect(document.activeElement).toBe(first)
  })
})
