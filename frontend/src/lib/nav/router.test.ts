import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import { getRoute, navigate, replace, startRouting, syncFromLocation } from './router.svelte'

const route = getRoute()

let stop: (() => void) | null = null

beforeEach(() => {
  window.history.replaceState({}, '', '/')
  syncFromLocation()
})

afterEach(() => {
  stop?.()
  stop = null
  window.history.replaceState({}, '', '/')
  syncFromLocation()
})

describe('reading the address bar', () => {
  test.each([
    ['/', 'home'],
    ['/budget', 'budget'],
    ['/accounts', 'accounts'],
    ['/knowledge', 'knowledge'],
    ['/profile', 'profile'],
    ['/users', 'users'],
    ['/audit', 'audit'],
    ['/verify', 'verify'],
  ] as const)('%s is the %s screen', (path, screen) => {
    window.history.replaceState({}, '', path)
    syncFromLocation()
    expect(route.screen).toBe(screen)
  })

  test('a trailing slash names the same screen', () => {
    window.history.replaceState({}, '', '/accounts/')
    syncFromLocation()
    expect(route.screen).toBe('accounts')
    expect(route.tab).toBeNull()
  })

  test('a second segment is the tab, handed over without being judged', () => {
    // Which tabs a screen has is the screen's business. Teaching the router
    // would mean it learning every screen's contents to answer a question the
    // screen can answer for itself by falling back to its first tab.
    window.history.replaceState({}, '', '/accounts/allocations')
    syncFromLocation()
    expect(route.screen).toBe('accounts')
    expect(route.tab).toBe('allocations')

    window.history.replaceState({}, '', '/accounts/nonsense')
    syncFromLocation()
    expect(route.tab).toBe('nonsense')
  })

  test('an unrecognised path is home, and the router does not rewrite it', () => {
    // Reading only. The shell sends it on to the landing screen, because that
    // is where the role is known and an admin starts somewhere a user does not.
    window.history.replaceState({}, '', '/budgt')
    syncFromLocation()
    expect(route.screen).toBe('home')
    expect(window.location.pathname).toBe('/budgt')
  })

  test('a query string names a screen without becoming part of it', () => {
    // The verification link arrives as /verify?token=… and the token has to
    // survive in the URL for the form to read.
    window.history.replaceState({}, '', '/verify?token=abc')
    syncFromLocation()
    expect(route.screen).toBe('verify')
    expect(route.pathname).toBe('/verify')
    expect(window.location.search).toBe('?token=abc')
  })
})

describe('going somewhere', () => {
  test('navigate moves the address bar and the screen together', () => {
    navigate('/accounts/allocations')
    expect(window.location.pathname).toBe('/accounts/allocations')
    expect(route.screen).toBe('accounts')
    expect(route.tab).toBe('allocations')
  })

  test('navigating where you already are changes nothing', () => {
    navigate('/budget')
    const depth = window.history.length
    navigate('/budget')
    expect(window.history.length).toBe(depth)
  })

  test('a tab switch is a step back can undo', () => {
    // Push rather than replace: this is a web app reached in a browser, and a
    // back gesture that leaps past the whole app to the previous website reads
    // as broken rather than as native.
    navigate('/budget')
    const depth = window.history.length
    navigate('/accounts')
    expect(window.history.length).toBe(depth + 1)
  })

  test('replace drops the query along with the screen', () => {
    // How a spent verification link is cleared: the token must not survive in
    // the address bar, and the screen must not be reachable with Back.
    window.history.replaceState({}, '', '/verify?token=spent')
    syncFromLocation()

    replace('/')

    expect(window.location.pathname).toBe('/')
    expect(window.location.search).toBe('')
    expect(route.screen).toBe('home')
  })
})

describe('the back button', () => {
  test('a popstate is heard once routing has started', () => {
    // The event is dispatched rather than driven through history.back(): jsdom
    // fires that asynchronously and on its own schedule, and what needs proving
    // here is that the listener is attached and reads the address bar — not
    // that jsdom implements session history.
    stop = startRouting()

    window.history.replaceState({}, '', '/users')
    window.dispatchEvent(new PopStateEvent('popstate'))

    expect(route.screen).toBe('users')
  })

  test('and not after the teardown runs', () => {
    // Returned rather than left attached so it can be handed to an `$effect`.
    // A listener surviving teardown would keep a torn-down component reactive.
    const teardown = startRouting()
    teardown()

    window.history.replaceState({}, '', '/users')
    window.dispatchEvent(new PopStateEvent('popstate'))

    expect(route.screen).toBe('home')
  })
})
