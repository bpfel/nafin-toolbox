import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'

const KEY = 'nafin.collapsedModules'

type CollapseStore = typeof import('./collapse.svelte')

// The store's `$state` is created once, at import time, from whatever
// localStorage held then. A fresh module instance is therefore the only honest
// way to simulate a reload — re-importing is what re-reads storage.
async function reload(): Promise<CollapseStore> {
  vi.resetModules()
  return await import('./collapse.svelte')
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

describe('module collapse state', () => {
  test('a module nobody has touched is expanded', async () => {
    const store = await reload()

    expect(store.isExpanded('budget')).toBe(true)
    expect(store.isExpanded('a-module-invented-next-year')).toBe(true)
  })

  test('modules fold independently', async () => {
    const store = await reload()

    store.toggleExpanded('budget')

    expect(store.isExpanded('budget')).toBe(false)
    expect(store.isExpanded('accounts')).toBe(true)
  })

  test('a collapsed module is still collapsed after a reload', async () => {
    const before = await reload()
    before.toggleExpanded('accounts')

    const after = await reload()

    expect(after.isExpanded('accounts')).toBe(false)
    expect(after.isExpanded('budget')).toBe(true)
  })

  test('expanding again survives a reload too', async () => {
    const before = await reload()
    before.toggleExpanded('accounts')
    before.toggleExpanded('accounts')

    const after = await reload()

    expect(after.isExpanded('accounts')).toBe(true)
  })

  test('only collapsed ids are written, so the stored value stays small', async () => {
    const store = await reload()

    store.toggleExpanded('budget')
    store.toggleExpanded('accounts')
    store.toggleExpanded('accounts')

    expect(JSON.parse(localStorage.getItem(KEY) as string)).toEqual(['budget'])
  })

  test('a stored value that is not a list of ids is ignored', async () => {
    for (const junk of ['not json at all', '{"budget":true}', 'null', '[1,2,3]']) {
      localStorage.setItem(KEY, junk)
      const store = await reload()

      expect(store.isExpanded('budget')).toBe(true)
    }
  })
})

describe('a localStorage that throws', () => {
  // Private-mode Safari, a full quota and blocked cookies all raise on access
  // rather than returning null. The read happens at import time, so a throw
  // there would take the app down before it rendered.
  test('does not break startup — everything simply shows', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('access denied')
    })

    const store = await reload()

    expect(store.isExpanded('budget')).toBe(true)
    expect(() => store.toggleExpanded('budget')).not.toThrow()
  })

  test('does not break the toggle — the fold still works for this session', async () => {
    const store = await reload()
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded')
    })

    expect(() => store.toggleExpanded('budget')).not.toThrow()
    expect(store.isExpanded('budget')).toBe(false)
  })
})
