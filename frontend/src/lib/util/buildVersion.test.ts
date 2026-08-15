import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  BUILD_ID,
  getBuildVersionState,
  checkBuildVersion,
  dismissUpdate,
  isModuleLoadError,
  resetBuildVersionState,
} from './buildVersion.svelte'

/** A build id guaranteed to differ from the one compiled into this bundle. */
const OTHER_BUILD_ID = `${BUILD_ID}-newer`

function mockVersionResponse(body: unknown, ok = true) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok,
    json: async () => body,
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('buildVersion', () => {
  beforeEach(() => {
    resetBuildVersionState()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('starts out not stale, with no build id seen', () => {
    const state = getBuildVersionState()
    expect(state.latestBuildId).toBeNull()
    expect(state.stale).toBe(false)
    expect(state.showBanner).toBe(false)
  })

  it('marks the app stale when the server reports a different build id', async () => {
    mockVersionResponse({ buildId: OTHER_BUILD_ID })

    await checkBuildVersion()

    const state = getBuildVersionState()
    expect(state.latestBuildId).toBe(OTHER_BUILD_ID)
    expect(state.stale).toBe(true)
    expect(state.showBanner).toBe(true)
  })

  it('does not mark the app stale when the build id matches', async () => {
    mockVersionResponse({ buildId: BUILD_ID })

    await checkBuildVersion()

    const state = getBuildVersionState()
    expect(state.latestBuildId).toBe(BUILD_ID)
    expect(state.stale).toBe(false)
    expect(state.showBanner).toBe(false)
  })

  it('requests version.json with cache busting', async () => {
    const fetchMock = mockVersionResponse({ buildId: BUILD_ID })

    await checkBuildVersion()

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toMatch(/^\/version\.json\?t=\d+$/)
    expect(init).toEqual({ cache: 'no-store' })
  })

  it('leaves state unchanged when the fetch rejects — offline is not stale', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    await expect(checkBuildVersion()).resolves.toBeUndefined()

    const state = getBuildVersionState()
    expect(state.latestBuildId).toBeNull()
    expect(state.stale).toBe(false)
  })

  it('leaves a previously seen build id unchanged when a later fetch rejects', async () => {
    mockVersionResponse({ buildId: BUILD_ID })
    await checkBuildVersion()

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))
    await checkBuildVersion()

    expect(getBuildVersionState().latestBuildId).toBe(BUILD_ID)
    expect(getBuildVersionState().stale).toBe(false)
  })

  it('ignores a non-ok response', async () => {
    mockVersionResponse({ buildId: OTHER_BUILD_ID }, false)

    await checkBuildVersion()

    expect(getBuildVersionState().latestBuildId).toBeNull()
    expect(getBuildVersionState().stale).toBe(false)
  })

  it('ignores a body that is not valid JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => { throw new SyntaxError('Unexpected token <') },
    }))

    await checkBuildVersion()

    expect(getBuildVersionState().stale).toBe(false)
  })

  it('ignores a body without a usable buildId', async () => {
    mockVersionResponse({ buildId: '' })
    await checkBuildVersion()
    expect(getBuildVersionState().latestBuildId).toBeNull()

    mockVersionResponse({ notTheField: 'x' })
    await checkBuildVersion()
    expect(getBuildVersionState().latestBuildId).toBeNull()
  })

  describe('dismissal', () => {
    it('hides the banner but keeps the app marked stale', async () => {
      mockVersionResponse({ buildId: OTHER_BUILD_ID })
      await checkBuildVersion()

      dismissUpdate()

      const state = getBuildVersionState()
      expect(state.showBanner).toBe(false)
      expect(state.stale).toBe(true)
    })

    it('does not suppress the banner for a subsequent build', async () => {
      mockVersionResponse({ buildId: OTHER_BUILD_ID })
      await checkBuildVersion()
      dismissUpdate()
      expect(getBuildVersionState().showBanner).toBe(false)

      mockVersionResponse({ buildId: `${OTHER_BUILD_ID}-again` })
      await checkBuildVersion()

      expect(getBuildVersionState().showBanner).toBe(true)
    })
  })

  describe('isModuleLoadError', () => {
    it.each([
      'Failed to fetch dynamically imported module: https://x/assets/encode-a1b2.js',
      'error loading dynamically imported module: https://x/assets/encode-a1b2.js',
      'Importing a module script failed.',
      'Expected a JavaScript module script but the server responded with a MIME type of text/html',
    ])('recognises %s', (message) => {
      expect(isModuleLoadError(new TypeError(message))).toBe(true)
    })

    it('ignores unrelated errors', () => {
      expect(isModuleLoadError(new Error('IBAN is invalid'))).toBe(false)
      expect(isModuleLoadError(new Error('Failed to fetch'))).toBe(false)
      expect(isModuleLoadError(null)).toBe(false)
      expect(isModuleLoadError(undefined)).toBe(false)
    })

    it('handles non-Error throwables', () => {
      expect(isModuleLoadError('Failed to fetch dynamically imported module')).toBe(true)
      expect(isModuleLoadError({})).toBe(false)
    })
  })
})
