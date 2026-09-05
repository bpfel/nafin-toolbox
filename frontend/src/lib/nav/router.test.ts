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
    ['/security', 'security'],
    ['/users', 'users'],
    ['/verify', 'verify'],
  ] as const)('%s is the %s screen', (path, screen) => {
    window.history.replaceState({}, '', path)
    syncFromLocation()
    expect(route.screen).toBe(screen)
  })

  test('a trailing slash names the same screen', () => {
    window.history.replaceState({}, '', '/security/')
    syncFromLocation()
    expect(route.screen).toBe('security')
  })

  test('an unrecognised path renders home and is left in the address bar', () => {
    // Rewriting it would be tidier and worse to debug: a mistyped link would
    // correct itself silently, and whoever followed it — the only person who
    // could tell you it is wrong — would never notice.
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
    navigate('/security')
    expect(window.location.pathname).toBe('/security')
    expect(route.screen).toBe('security')
  })

  test('navigating where you already are changes nothing', () => {
    navigate('/security')
    const depth = window.history.length
    navigate('/security')
    expect(window.history.length).toBe(depth)
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
