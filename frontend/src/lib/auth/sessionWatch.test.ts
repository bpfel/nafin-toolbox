import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { startSessionWatch } from './sessionWatch'

/**
 * A tab whose session was ended on another device — "Log out everywhere", a
 * password change — has to notice by itself, or it goes on showing the budget.
 */
describe('watching for a session ended elsewhere', () => {
  let status = 200
  let visibility: DocumentVisibilityState = 'visible'
  const fetchMock = vi.fn(async () => {
    if (status === 0) throw new TypeError('Failed to fetch')
    return { status } as Response
  })

  beforeEach(() => {
    vi.useFakeTimers()
    status = 200
    visibility = 'visible'
    fetchMock.mockClear()
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  test('logs out when the tab comes back into view and the session is gone', async () => {
    const ended = vi.fn()
    const stop = startSessionWatch(ended)

    status = 401
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.waitFor(() => expect(ended).toHaveBeenCalledTimes(1))
    stop()
  })

  test('logs out on focus — two windows side by side are both visible', async () => {
    const ended = vi.fn()
    const stop = startSessionWatch(ended)

    status = 401
    window.dispatchEvent(new Event('focus'))
    await vi.waitFor(() => expect(ended).toHaveBeenCalledTimes(1))
    stop()
  })

  test('a tab left open on screen notices within half a minute, once', async () => {
    const ended = vi.fn()
    const stop = startSessionWatch(ended)

    await vi.advanceTimersByTimeAsync(30_000)
    expect(ended).not.toHaveBeenCalled()

    status = 401
    await vi.advanceTimersByTimeAsync(30_000)
    expect(ended).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(120_000)
    window.dispatchEvent(new Event('focus'))
    await vi.advanceTimersByTimeAsync(0)
    expect(ended).toHaveBeenCalledTimes(1)
    stop()
  })

  test('a hidden tab does not ask', async () => {
    const stop = startSessionWatch(vi.fn())
    visibility = 'hidden'

    await vi.advanceTimersByTimeAsync(120_000)

    expect(fetchMock).not.toHaveBeenCalled()
    stop()
  })

  // Offline or a server error says nothing about the session.
  test('being offline or a server error is not a logout', async () => {
    const ended = vi.fn()
    const stop = startSessionWatch(ended)

    status = 0
    await vi.advanceTimersByTimeAsync(30_000)
    status = 503
    await vi.advanceTimersByTimeAsync(30_000)

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(ended).not.toHaveBeenCalled()
    stop()
  })

  test('stops asking once torn down', async () => {
    const stop = startSessionWatch(vi.fn())
    stop()

    await vi.advanceTimersByTimeAsync(120_000)
    window.dispatchEvent(new Event('focus'))

    expect(fetchMock).not.toHaveBeenCalled()
  })
})
