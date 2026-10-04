import { describe, test, expect } from 'vitest'
import { shouldOfferIosInstall } from './installHint'

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15'
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36'

describe('the iOS install hint', () => {
  test('shows on an iPhone in a browser tab', () => {
    expect(shouldOfferIosInstall({ userAgent: IPHONE, platform: 'iPhone', maxTouchPoints: 5 }, false)).toBe(true)
  })

  test('shows on an iPad, which calls itself a Mac', () => {
    expect(shouldOfferIosInstall({ userAgent: MAC, platform: 'MacIntel', maxTouchPoints: 5 }, false)).toBe(true)
  })

  test('does not show on a Mac', () => {
    expect(shouldOfferIosInstall({ userAgent: MAC, platform: 'MacIntel', maxTouchPoints: 0 }, false)).toBe(false)
  })

  test('does not show on Android, whose browser offers to install by itself', () => {
    expect(shouldOfferIosInstall({ userAgent: ANDROID, platform: 'Linux armv8l', maxTouchPoints: 5 }, false)).toBe(false)
  })

  test('does not show once installed, by either signal', () => {
    expect(shouldOfferIosInstall({ userAgent: IPHONE, platform: 'iPhone', maxTouchPoints: 5 }, true)).toBe(false)
    expect(
      shouldOfferIosInstall({ userAgent: IPHONE, platform: 'iPhone', maxTouchPoints: 5, standalone: true }, false),
    ).toBe(false)
  })
})
