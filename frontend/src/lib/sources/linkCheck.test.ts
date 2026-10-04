import { describe, test, expect } from 'vitest'
import { verdict, landedOnFrontPage } from './linkCheck'

const PAGE = 'https://www.estv.admin.ch/de/some-page'

describe('reading a link’s answer', () => {
  test('a 200 on the page asked for is there', () => {
    expect(verdict(200, PAGE, PAGE)).toBe('there')
  })

  test('a redirect to another page is still there', () => {
    // Apple sends its short guide URLs on to a longer slug.
    const short = 'https://support.apple.com/guide/iphone/iphea86e5236/ios'
    const long = 'https://support.apple.com/guide/iphone/open-as-web-app-iphea86e5236/ios'
    expect(verdict(200, short, long)).toBe('there')
  })

  test.each([404, 410, 500, 302])('%i is gone', status => {
    expect(verdict(status, PAGE, PAGE)).toBe('gone')
  })

  test.each([401, 403, 429])('%i is a refusal, not an absence', status => {
    expect(verdict(status, PAGE, PAGE)).toBe('blocked')
  })

  test('a redirect to the front page is gone, even with a 200', () => {
    expect(verdict(200, PAGE, 'https://www.estv.admin.ch/de/')).toBe('gone')
  })
})

describe('what counts as the front page', () => {
  test.each(['/', '/de', '/de/', '/de-ch/'])('%s is', path => {
    expect(landedOnFrontPage(PAGE, `https://example.ch${path}`)).toBe(true)
  })

  test('a deeper page is not', () => {
    expect(landedOnFrontPage(PAGE, 'https://www.estv.admin.ch/de/other')).toBe(false)
  })

  test('a link that is itself a front page cannot land on one', () => {
    expect(landedOnFrontPage('https://www.ch.ch/de/', 'https://www.ch.ch/')).toBe(false)
  })
})
