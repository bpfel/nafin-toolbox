import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/svelte'
import { describe, test, expect, afterEach } from 'vitest'
import ScreenChrome from './ScreenChrome.svelte'
import { amountsHidden, hidingAmounts, resetHidingAmounts } from '../util/privacy.svelte'

afterEach(() => {
  cleanup()
  resetHidingAmounts()
})

describe('the screen heading', () => {
  afterEach(cleanup)

  test('names the screen for anything reading the document', () => {
    // Not visible: the navigation bar already highlights the screen you are on,
    // and on Accounts the sub-tabs say it a third time. It stays in the document
    // because screen readers navigate by heading, and a page with none is a page
    // that cannot be jumped into.
    render(ScreenChrome, { title: 'Budget' })

    expect(screen.getByRole('heading', { level: 1, name: 'Budget' })).toBeTruthy()
  })
})

describe('the hide-amounts eye', () => {
  test('offers to hide, then to show', async () => {
    // Never "lock" or "protect". This defeats a glance over the shoulder and
    // nothing else, and must not be mistaken for the vault.
    render(ScreenChrome, { title: 'Budget' })

    const eye = screen.getByRole('button', { name: 'Hide amounts' })
    expect(eye.getAttribute('aria-pressed')).toBe('false')

    await fireEvent.click(eye)

    expect(hidingAmounts()).toBe(true)
    const armed = await screen.findByRole('button', { name: 'Show amounts' })
    expect(armed.getAttribute('aria-pressed')).toBe('true')
  })

  test('is absent where there is nothing to hide', async () => {
    render(ScreenChrome, { title: 'Profile', eye: false })

    expect(screen.queryByRole('button', { name: 'Hide amounts' })).toBeNull()
  })

  test('holding it reveals the figures, and letting go puts them back', async () => {
    render(ScreenChrome, { title: 'Budget' })
    await fireEvent.click(screen.getByRole('button', { name: 'Hide amounts' }))

    const eye = screen.getByRole('button', { name: 'Show amounts' })

    await fireEvent.pointerDown(eye)
    await waitFor(() => expect(amountsHidden()).toBe(false), { timeout: 1000 })

    // The setting is untouched throughout, so the control does not flip under
    // the thumb that is holding it.
    expect(hidingAmounts()).toBe(true)

    await fireEvent.pointerUp(eye)
    expect(amountsHidden()).toBe(true)
  })

  test('and the hold is not also a request to change the setting', async () => {
    // pointerup is followed by a click. Without this, one hold would reveal the
    // figures and then leave them permanently revealed.
    render(ScreenChrome, { title: 'Budget' })
    await fireEvent.click(screen.getByRole('button', { name: 'Hide amounts' }))

    const eye = screen.getByRole('button', { name: 'Show amounts' })

    await fireEvent.pointerDown(eye)
    await waitFor(() => expect(amountsHidden()).toBe(false), { timeout: 1000 })
    await fireEvent.pointerUp(eye)
    await fireEvent.click(eye)

    expect(hidingAmounts()).toBe(true)
  })

  test('a plain tap still toggles', async () => {
    // The tap has to be quick enough not to start a peek, which is the whole
    // reason the hold has a delay in front of it.
    render(ScreenChrome, { title: 'Budget' })
    const eye = screen.getByRole('button', { name: 'Hide amounts' })

    await fireEvent.pointerDown(eye)
    await fireEvent.pointerUp(eye)
    await fireEvent.click(eye)

    expect(hidingAmounts()).toBe(true)
  })
})

describe('the strip is one row of one kind of control', () => {
  afterEach(cleanup)

  test('every control carries words for anything that cannot see the symbol', () => {
    // Icon-only is what makes the row uniform and what stops it shifting
    // sideways when Edit becomes Done, or when the language changes and both
    // become longer. It also says nothing on its own, which is why the label is
    // required rather than optional.
    render(ScreenChrome, { title: 'Budget', editKey: 'budget' })

    const buttons = screen.getAllByRole('button')
    expect(buttons.length).toBeGreaterThan(0)
    for (const button of buttons) {
      expect(button.getAttribute('aria-label')?.trim()).toBeTruthy()
      expect(button.getAttribute('title')?.trim()).toBeTruthy()
      expect(button.textContent?.trim()).toBe('')
    }
  })

  test('a toggle says whether it is on', () => {
    render(ScreenChrome, { title: 'Budget', editKey: 'budget' })

    const edit = screen.getByRole('button', { name: 'Edit' })
    expect(edit.getAttribute('aria-pressed')).toBe('false')
  })
})
