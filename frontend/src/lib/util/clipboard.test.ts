import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { copyText } from './clipboard'

const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')

function setClipboard(value: unknown) {
  Object.defineProperty(navigator, 'clipboard', { value, configurable: true })
}

describe('copyText', () => {
  beforeEach(() => {
    // jsdom implements neither API, so both are stubs here.
    document.execCommand = vi.fn(() => true)
  })

  afterEach(() => {
    if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard)
    else setClipboard(undefined)
    vi.restoreAllMocks()
  })

  test('uses the async clipboard when it is available', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    setClipboard({ writeText })

    expect(await copyText('ABCD-EFGH')).toBe(true)
    expect(writeText).toHaveBeenCalledWith('ABCD-EFGH')
    expect(document.execCommand).not.toHaveBeenCalled()
  })

  test('falls back when there is no clipboard API at all', async () => {
    // The insecure-origin case: plain http on a LAN, which self-hosting invites.
    setClipboard(undefined)

    expect(await copyText('ABCD-EFGH')).toBe(true)
    expect(document.execCommand).toHaveBeenCalledWith('copy')
  })

  test('falls back when the clipboard API rejects', async () => {
    setClipboard({ writeText: vi.fn().mockRejectedValue(new Error('denied')) })

    expect(await copyText('ABCD-EFGH')).toBe(true)
    expect(document.execCommand).toHaveBeenCalledWith('copy')
  })

  test('reports failure when the fallback also fails', async () => {
    setClipboard(undefined)
    document.execCommand = vi.fn(() => false)

    expect(await copyText('ABCD-EFGH')).toBe(false)
  })

  test('reports failure when the fallback throws', async () => {
    setClipboard(undefined)
    document.execCommand = vi.fn(() => { throw new Error('nope') })

    expect(await copyText('ABCD-EFGH')).toBe(false)
  })

  test('leaves no scratch element behind', async () => {
    setClipboard(undefined)
    const before = document.body.children.length

    await copyText('ABCD-EFGH')

    expect(document.body.children.length).toBe(before)
  })
})
