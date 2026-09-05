import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/svelte'
import { describe, test, expect, afterEach } from 'vitest'
import ScreenHeader from './ScreenHeader.svelte'
import { amountsHidden, hidingAmounts, resetHidingAmounts } from '../util/privacy.svelte'

afterEach(() => {
  cleanup()
  resetHidingAmounts()
})

describe('the hide-amounts eye', () => {
  test('offers to hide, then to show', async () => {
    // Never "lock" or "protect". This defeats a glance over the shoulder and
    // nothing else, and must not be mistaken for the vault.
    render(ScreenHeader, { title: 'Budget' })

    const eye = screen.getByRole('button', { name: 'Hide amounts' })
    expect(eye.getAttribute('aria-pressed')).toBe('false')

    await fireEvent.click(eye)

    expect(hidingAmounts()).toBe(true)
    const armed = await screen.findByRole('button', { name: 'Show amounts' })
    expect(armed.getAttribute('aria-pressed')).toBe('true')
  })

  test('is absent where there is nothing to hide', async () => {
    render(ScreenHeader, { title: 'Profile', eye: false })

    expect(screen.queryByRole('button', { name: 'Hide amounts' })).toBeNull()
  })

  test('holding it reveals the figures, and letting go puts them back', async () => {
    render(ScreenHeader, { title: 'Budget' })
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
    render(ScreenHeader, { title: 'Budget' })
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
    render(ScreenHeader, { title: 'Budget' })
    const eye = screen.getByRole('button', { name: 'Hide amounts' })

    await fireEvent.pointerDown(eye)
    await fireEvent.pointerUp(eye)
    await fireEvent.click(eye)

    expect(hidingAmounts()).toBe(true)
  })
})
