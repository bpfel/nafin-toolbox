import { describe, test, expect } from 'vitest'
import { externalSources } from './registry'

/**
 * Holds the registry to the source tree.
 *
 * The registry is collected from the places links are meant to live. That only
 * works if they live nowhere else, so this reads every source file for an
 * `https://` and asks the registry about each one. Whether the pages still
 * exist is a separate, networked question — `sources.links.ts`, run on a
 * schedule rather than with every test.
 */

const FILES = import.meta.glob(['/src/**/*.ts', '/src/**/*.svelte', '!/src/**/*.test.ts', '!/src/**/*.links.ts'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

/**
 * URLs in the source that are not somewhere we send a reader, and why.
 *
 * Matched by prefix. Each is checked to still occur, so a line here cannot
 * outlive the code it excuses.
 */
const NOT_SOURCES: { prefix: string; why: string }[] = [
  {
    prefix: 'https://example.invalid/',
    why: 'The pretend invitation link in the tour’s example household. `.invalid` can never resolve.',
  },
  {
    prefix: 'https://api.qrserver.com/',
    why: 'Renders the two-factor QR code. Not a page a reader is sent to — and a third party seeing the TOTP secret, which wants replacing with a local renderer.',
  },
]

const URL_PATTERN = /https:\/\/[^\s'"`<>)\]{}]+/g

function urlsInSource(): { file: string; url: string }[] {
  return Object.entries(FILES).flatMap(([file, text]) =>
    // A URL at the end of a sentence in a comment keeps its full stop otherwise.
    [...text.matchAll(URL_PATTERN)].map(m => ({ file, url: m[0].replace(/[.,;:]+$/, '') })),
  )
}

describe('every link the app shows is in the registry', () => {
  const known = new Set(externalSources().map(s => s.url))

  test('the registry finds links at all', () => {
    // Without this a broken glob would leave everything below passing over
    // nothing — the way a guard quietly stops guarding.
    expect(externalSources().length).toBeGreaterThan(5)
  })

  test('no https URL lives outside the registry', () => {
    const stray = urlsInSource()
      .filter(({ url }) => !known.has(url))
      .filter(({ url }) => !NOT_SOURCES.some(n => url.startsWith(n.prefix)))
      .map(({ file, url }) => `${file}: ${url}`)
    expect(stray).toEqual([])
  })

  test.each(NOT_SOURCES)('the exception for $prefix is still needed', ({ prefix }) => {
    expect(urlsInSource().some(({ url }) => url.startsWith(prefix))).toBe(true)
  })

  test.each(externalSources())('$url is https and labelled', ({ url, label }) => {
    expect(new URL(url).protocol).toBe('https:')
    expect(label.trim()).toBeTruthy()
  })
})
