import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { createCopier } from './copier.svelte'

const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')

function setClipboard(value: unknown) {
  Object.defineProperty(navigator, 'clipboard', { value, configurable: true })
}

describe('createCopier', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard)
    else setClipboard(undefined)
  })

  test('reports a successful copy, then reverts', async () => {
    setClipboard({ writeText: vi.fn().mockResolvedValue(undefined) })
    const copier = createCopier()

    expect(copier.copied).toBe(false)

    await copier.copy('ABCD-EFGH')
    expect(copier.copied).toBe(true)
    expect(copier.failed).toBe(false)

    await vi.advanceTimersByTimeAsync(2600)
    expect(copier.copied).toBe(false)
  })

  test('a failure stays on screen rather than fading', async () => {
    setClipboard(undefined)
    document.execCommand = vi.fn(() => false)
    const copier = createCopier()

    await copier.copy('ABCD-EFGH')
    expect(copier.failed).toBe(true)
    expect(copier.copied).toBe(false)

    // These secrets are shown once, so the explanation must not time out from
    // under a user who is still reading it.
    await vi.advanceTimersByTimeAsync(10_000)
    expect(copier.failed).toBe(true)
  })

  test('a later success clears an earlier failure', async () => {
    setClipboard(undefined)
    document.execCommand = vi.fn(() => false)
    const copier = createCopier()

    await copier.copy('ABCD-EFGH')
    expect(copier.failed).toBe(true)

    document.execCommand = vi.fn(() => true)
    await copier.copy('ABCD-EFGH')
    expect(copier.failed).toBe(false)
    expect(copier.copied).toBe(true)
  })

  test('two copiers do not share state', async () => {
    setClipboard({ writeText: vi.fn().mockResolvedValue(undefined) })
    const one = createCopier()
    const two = createCopier()

    await one.copy('ABCD-EFGH')

    expect(one.copied).toBe(true)
    expect(two.copied).toBe(false)
  })
})
