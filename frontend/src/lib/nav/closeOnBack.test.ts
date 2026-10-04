import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import { closeOnBack } from './closeOnBack'
import { getRoute, navigate, startRouting, syncFromLocation } from './router.svelte'

const route = getRoute()
const node = document.createElement('div')

/** Resolves on the next popstate, which jsdom fires a task after `go()`. */
function popped(): Promise<void> {
  return new Promise((resolve) => window.addEventListener('popstate', () => resolve(), { once: true }))
}

/** Lets a scheduled `go()` run and land. */
async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 20))
}

function back(): Promise<void> {
  const done = popped()
  window.history.back()
  return done
}

let stop: () => void

beforeEach(() => {
  window.history.replaceState({ page: true }, '', '/budget')
  stop = startRouting()
})

afterEach(async () => {
  stop()
  await settle()
  window.history.replaceState({}, '', '/')
  syncFromLocation()
})

describe('the back gesture over a dialog', () => {
  test('opening a dialog leaves a step at the same address', () => {
    const dialog = closeOnBack(node, () => {})
    expect(window.location.pathname).toBe('/budget')
    expect(window.history.state.nafinLayer).toEqual(expect.any(Number))
    dialog.destroy()
  })

  test('back closes the dialog and leaves the screen where it was', async () => {
    const onclose = vi.fn()
    const dialog = closeOnBack(node, onclose)

    await back()

    expect(onclose).toHaveBeenCalledOnce()
    expect(route.screen).toBe('budget')
    expect(window.history.state).toEqual({ page: true })
    // The component unmounts in response; that must not take a second step.
    dialog.destroy()
    await settle()
    expect(window.history.state).toEqual({ page: true })
  })

  test('closing it any other way takes its step back out', async () => {
    const dialog = closeOnBack(node, () => {})
    const done = popped()
    dialog.destroy()
    await done
    expect(window.history.state).toEqual({ page: true })
  })

  test('back closes the top dialog only', async () => {
    const closeSheet = vi.fn()
    const closeConfirm = vi.fn()
    const sheet = closeOnBack(node, closeSheet)
    const confirm = closeOnBack(node, closeConfirm)

    await back()
    expect(closeConfirm).toHaveBeenCalledOnce()
    expect(closeSheet).not.toHaveBeenCalled()
    confirm.destroy()

    await back()
    expect(closeSheet).toHaveBeenCalledOnce()
    sheet.destroy()
    expect(window.history.state).toEqual({ page: true })
  })

  test('closing a sheet with a dialog on it takes both steps out at once', async () => {
    const sheet = closeOnBack(node, () => {})
    const confirm = closeOnBack(node, () => {})
    const done = popped()
    sheet.destroy()
    confirm.destroy()
    await done
    expect(window.history.state).toEqual({ page: true })
  })

  test('one dialog handing over to the next keeps the second one on back', async () => {
    const closeEdit = vi.fn()
    const closeDelete = vi.fn()
    const edit = closeOnBack(node, closeEdit)

    edit.destroy()
    const del = closeOnBack(node, closeDelete)
    await settle()
    expect(window.history.state.nafinLayer).toEqual(expect.any(Number))

    await back()
    expect(closeDelete).toHaveBeenCalledOnce()
    expect(window.history.state).toEqual({ page: true })
    del.destroy()
  })
})

describe('navigating out of a dialog', () => {
  test('the new screen replaces the dialog step, so back returns to the old screen', async () => {
    const dialog = closeOnBack(node, () => {})
    navigate('/accounts')
    dialog.destroy()
    await vi.waitFor(() => expect(route.screen).toBe('accounts'))
    expect(window.location.pathname).toBe('/accounts')

    await back()
    expect(route.screen).toBe('budget')
    expect(window.history.state).toEqual({ page: true })
  })

  test('with no dialog open, navigating is immediate', () => {
    navigate('/accounts')
    expect(route.screen).toBe('accounts')
  })
})
