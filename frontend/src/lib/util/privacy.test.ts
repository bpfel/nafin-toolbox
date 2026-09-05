import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'

const KEY = 'nafin.hideAmounts'

type PrivacyStore = typeof import('./privacy.svelte')

// The store's `$state` is created once, at import time, from whatever
// localStorage held then. A fresh module instance is the only honest way to
// simulate a reload — re-importing is what re-reads storage.
async function reload(): Promise<PrivacyStore> {
  vi.resetModules()
  return await import('./privacy.svelte')
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

describe('hiding amounts', () => {
  test('figures are visible until someone asks otherwise', async () => {
    const privacy = await reload()

    expect(privacy.hidingAmounts()).toBe(false)
    expect(privacy.amountsHidden()).toBe(false)
  })

  test('the setting survives a reload', async () => {
    // The whole point: you turn it on because of where you use this device, and
    // a refresh does not move the device.
    const before = await reload()
    before.toggleHidingAmounts()
    expect(localStorage.getItem(KEY)).toBe('true')

    const after = await reload()
    expect(after.amountsHidden()).toBe(true)
  })

  test('and can be turned off again', async () => {
    const privacy = await reload()

    privacy.toggleHidingAmounts()
    privacy.toggleHidingAmounts()

    expect(privacy.amountsHidden()).toBe(false)
    expect(localStorage.getItem(KEY)).toBe('false')
  })
})

describe('peeking', () => {
  test('a peek reveals the figures without changing the setting', async () => {
    // So the eye does not flip under the thumb holding it down, and so letting
    // go puts things back rather than leaving them exposed.
    const privacy = await reload()
    privacy.toggleHidingAmounts()

    privacy.beginPeek()
    expect(privacy.amountsHidden()).toBe(false)
    expect(privacy.hidingAmounts()).toBe(true)

    privacy.endPeek()
    expect(privacy.amountsHidden()).toBe(true)
  })

  test('there is nothing to peek at when nothing is hidden', async () => {
    const privacy = await reload()

    privacy.beginPeek()

    // Were this to latch, the next toggle would hide the figures and a stale
    // peek would immediately show them again.
    expect(privacy.amountsHidden()).toBe(false)
    privacy.toggleHidingAmounts()
    expect(privacy.amountsHidden()).toBe(true)
  })

  test('toggling ends a peek in progress', async () => {
    const privacy = await reload()
    privacy.toggleHidingAmounts()
    privacy.beginPeek()

    privacy.toggleHidingAmounts()

    expect(privacy.hidingAmounts()).toBe(false)
    expect(privacy.amountsHidden()).toBe(false)
  })
})

describe('when storage is unavailable', () => {
  test('the app still starts, with the figures showing', async () => {
    // Safari private browsing, a full quota and blocked cookies all throw on
    // access rather than returning null. This module is read at import time, so
    // an uncaught throw would take the page down before it rendered anything.
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage is not available')
    })

    const privacy = await reload()

    expect(privacy.amountsHidden()).toBe(false)
  })

  test('and the setting still works for as long as the tab lives', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage is not available')
    })

    const privacy = await reload()
    privacy.toggleHidingAmounts()

    expect(privacy.amountsHidden()).toBe(true)
  })
})
