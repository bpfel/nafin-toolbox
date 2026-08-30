import { cleanup, render, screen, fireEvent, within } from '@testing-library/svelte'
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'

import SettingsMenu from './SettingsMenu.svelte'
import { resetLocale, getLocale } from '../i18n/index.svelte'

beforeEach(() => {
  localStorage.clear()
  Object.defineProperty(navigator, 'languages', { value: ['en'], configurable: true })
  resetLocale()
})

afterEach(() => {
  cleanup()
  localStorage.clear()
})

function show() {
  const onnavigate = vi.fn()
  const onlogout = vi.fn()
  render(SettingsMenu, {
    props: { role: 'user', email: 'anna@example.ch', onnavigate, onlogout },
  })
  return { onnavigate, onlogout }
}

const gear = () => screen.getByRole('button', { name: 'Settings' })
const panel = () => screen.getByRole('menu', { name: 'Settings' })

async function open() {
  await fireEvent.click(gear())
  return panel()
}

describe('the gear', () => {
  test('starts closed and says so', () => {
    show()

    expect(screen.queryByRole('menu')).toBeNull()
    expect(gear().getAttribute('aria-expanded')).toBe('false')
    expect(gear().getAttribute('aria-haspopup')).toBe('menu')
  })

  test('opens to the four items', async () => {
    show()
    const p = await open()

    expect(within(p).getByRole('menuitem', { name: /Security/ })).toBeTruthy()
    expect(within(p).getByRole('menuitem', { name: /Modules/ })).toBeTruthy()
    expect(within(p).getByRole('menuitem', { name: /Language/ })).toBeTruthy()
    expect(within(p).getByRole('menuitem', { name: /Log out/ })).toBeTruthy()
  })

  test('carries the role and email, which the bar hides on a narrow screen', async () => {
    show()
    const p = await open()

    expect(within(p).getByText('user')).toBeTruthy()
    expect(within(p).getByText('anna@example.ch')).toBeTruthy()
  })

  test('Escape closes it', async () => {
    show()
    await open()

    await fireEvent.keyDown(window, { key: 'Escape' })

    expect(screen.queryByRole('menu')).toBeNull()
  })

  test('the gear toggles it shut again', async () => {
    show()
    await open()

    await fireEvent.click(gear())

    expect(screen.queryByRole('menu')).toBeNull()
  })
})

describe('navigating', () => {
  test('Security and Modules hand off and close', async () => {
    const { onnavigate } = show()
    let p = await open()

    await fireEvent.click(within(p).getByRole('menuitem', { name: /Security/ }))
    expect(onnavigate).toHaveBeenCalledWith('security')
    expect(screen.queryByRole('menu')).toBeNull()

    p = await open()
    await fireEvent.click(within(p).getByRole('menuitem', { name: /Modules/ }))
    expect(onnavigate).toHaveBeenCalledWith('modules')
  })

  test('Log out hands off and closes', async () => {
    const { onlogout } = show()
    const p = await open()

    await fireEvent.click(within(p).getByRole('menuitem', { name: /Log out/ }))

    expect(onlogout).toHaveBeenCalled()
    expect(screen.queryByRole('menu')).toBeNull()
  })
})

describe('the language list', () => {
  test('shows what is shippable, marking the current one', async () => {
    show()
    const p = await open()

    await fireEvent.click(within(p).getByRole('menuitem', { name: /Language/ }))

    const current = screen.getByRole('menuitemradio', { name: /English/ })
    expect(current.getAttribute('aria-checked')).toBe('true')
    expect(screen.getByRole('menuitemradio', { name: /Deutsch/ })).toBeTruthy()
    // Declared but unshipped, so it must not be offerable.
    expect(screen.queryByRole('menuitemradio', { name: /Français/ })).toBeNull()
  })

  test('says which languages are still being translated', async () => {
    show()
    const p = await open()
    await fireEvent.click(within(p).getByRole('menuitem', { name: /Language/ }))

    const romansh = screen.getByRole('menuitemradio', { name: /Rumantsch/ })

    expect(romansh.textContent).toMatch(/partly translated/i)
  })

  test('choosing one switches the interface immediately', async () => {
    show()
    const p = await open()
    await fireEvent.click(within(p).getByRole('menuitem', { name: /Language/ }))

    await fireEvent.click(screen.getByRole('menuitemradio', { name: /Deutsch/ }))

    expect(getLocale()).toBe('de')
    // The list is still open, now in German — which is the confirmation.
    expect(screen.getByRole('menuitemradio', { name: /Deutsch/ }).getAttribute('aria-checked')).toBe('true')
  })

  test('stays open so a wrong choice can be undone', async () => {
    show()
    const p = await open()
    await fireEvent.click(within(p).getByRole('menuitem', { name: /Language/ }))

    await fireEvent.click(screen.getByRole('menuitemradio', { name: /Rumantsch/ }))
    expect(getLocale()).toBe('rm')

    // Endonyms are why this is still findable in a language you cannot read.
    await fireEvent.click(screen.getByRole('menuitemradio', { name: /English/ }))
    expect(getLocale()).toBe('en')
  })

  test('back returns to the menu', async () => {
    show()
    const p = await open()
    await fireEvent.click(within(p).getByRole('menuitem', { name: /Language/ }))

    await fireEvent.click(screen.getByRole('menuitem', { name: /Back/ }))

    expect(screen.getByRole('menuitem', { name: /Security/ })).toBeTruthy()
  })

  test('the menu itself is translated', async () => {
    show()
    let p = await open()
    await fireEvent.click(within(p).getByRole('menuitem', { name: /Language/ }))
    await fireEvent.click(screen.getByRole('menuitemradio', { name: /Deutsch/ }))
    await fireEvent.click(screen.getByRole('menuitem', { name: /Zurück/ }))

    p = screen.getByRole('menu')
    expect(within(p).getByRole('menuitem', { name: /Sicherheit/ })).toBeTruthy()
    expect(within(p).getByRole('menuitem', { name: /Abmelden/ })).toBeTruthy()
  })
})
