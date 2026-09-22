import { cleanup, render, screen, fireEvent, within } from '@testing-library/svelte'
import { describe, test, expect, beforeEach, afterEach } from 'vitest'

import LanguagePicker from './LanguagePicker.svelte'
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

const trigger = () => screen.getByRole('button', { name: 'Language' })

async function open() {
  await fireEvent.click(trigger())
  return screen.getByRole('menu', { name: 'Language' })
}

describe('the trigger', () => {
  test('starts closed and says so', () => {
    render(LanguagePicker)

    expect(screen.queryByRole('menu')).toBeNull()
    expect(trigger().getAttribute('aria-expanded')).toBe('false')
    expect(trigger().getAttribute('aria-haspopup')).toBe('menu')
  })

  test('names itself, since the icon carries no words', () => {
    render(LanguagePicker)

    // Both, deliberately: the label for assistive tech, the tooltip for a
    // pointer. The name carries the meaning; these carry the purpose.
    expect(trigger().getAttribute('aria-label')).toBe('Language')
    expect(trigger().getAttribute('title')).toBe('Language')
  })

  /**
   * It used to be a globe, which said "language" without saying which. The
   * name says both, and on the signed-out screens — which have no label beside
   * it — the endonym is the only thing identifying the control at all.
   */
  test('names the language it is currently in', () => {
    render(LanguagePicker)

    expect(trigger().textContent).toContain('English')
  })

  test('Escape closes it', async () => {
    render(LanguagePicker)
    await open()

    await fireEvent.keyDown(window, { key: 'Escape' })

    expect(screen.queryByRole('menu')).toBeNull()
  })

  test('the trigger toggles it shut again', async () => {
    render(LanguagePicker)
    await open()

    await fireEvent.click(trigger())

    expect(screen.queryByRole('menu')).toBeNull()
  })
})

describe('the list', () => {
  test('shows what is shippable, marking the current one', async () => {
    render(LanguagePicker)
    const p = await open()

    expect(within(p).getByRole('menuitemradio', { name: /English/ }).getAttribute('aria-checked')).toBe('true')
    // All four national languages plus English, listed in endonyms.
    for (const name of [/Deutsch/, /Français/, /Italiano/, /Rumantsch/, /English/]) {
      expect(within(p).getByRole('menuitemradio', { name })).toBeTruthy()
    }
  })

  test('says which languages are still being translated', async () => {
    render(LanguagePicker)
    const p = await open()

    expect(within(p).getByRole('menuitemradio', { name: /Rumantsch/ }).textContent).toMatch(
      /partly translated/i,
    )
  })

  test('choosing one switches the interface immediately', async () => {
    render(LanguagePicker)
    await open()

    await fireEvent.click(screen.getByRole('menuitemradio', { name: /Deutsch/ }))

    expect(getLocale()).toBe('de')
    expect(
      screen.getByRole('menuitemradio', { name: /Deutsch/ }).getAttribute('aria-checked'),
    ).toBe('true')
  })

  test('stays open so a wrong choice can be undone', async () => {
    render(LanguagePicker)
    await open()

    await fireEvent.click(screen.getByRole('menuitemradio', { name: /Rumantsch/ }))
    expect(getLocale()).toBe('rm')

    // Endonyms are why this is still findable in a language you cannot read.
    await fireEvent.click(screen.getByRole('menuitemradio', { name: /English/ }))
    expect(getLocale()).toBe('en')
  })

  test('the choice outlives the tab', async () => {
    render(LanguagePicker)
    await open()

    await fireEvent.click(screen.getByRole('menuitemradio', { name: /Italiano/ }))

    // The whole point of the control on the login screen: someone who corrects
    // the language before signing up should not have to correct it again after.
    expect(localStorage.getItem('nafin.locale')).toBe('it')
  })

  test('the document follows, so screen readers and Intl agree', async () => {
    render(LanguagePicker)
    await open()

    await fireEvent.click(screen.getByRole('menuitemradio', { name: /Français/ }))

    expect(document.documentElement.lang).toBe('fr')
  })
})
