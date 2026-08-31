import { cleanup, render, screen, fireEvent, within } from '@testing-library/svelte'
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'

import SettingsMenu from './SettingsMenu.svelte'
import { resetLocale } from '../i18n/index.svelte'

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

  test('opens to its three items — language has its own control now', async () => {
    show()
    const p = await open()

    expect(within(p).getByRole('menuitem', { name: /Security/ })).toBeTruthy()
    expect(within(p).getByRole('menuitem', { name: /Modules/ })).toBeTruthy()
    expect(within(p).getByRole('menuitem', { name: /Log out/ })).toBeTruthy()
    expect(within(p).queryByRole('menuitem', { name: /Language/ })).toBeNull()
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

