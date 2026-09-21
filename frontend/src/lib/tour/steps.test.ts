import { describe, test, expect } from 'vitest'
import { TOUR_STEPS } from './steps'
import { destinationsFor } from '../nav/destinations'

/**
 * That the tour goes somewhere real.
 *
 * A step's `path` is a string, so a renamed destination leaves the tour
 * pointing at an address the shell will bounce to the landing screen — and the
 * symptom is a tour that silently loops on Budget rather than an error anybody
 * sees. This is the only place the two lists are compared.
 */
describe('every step goes somewhere a user can be', () => {
  const userPaths = new Set(destinationsFor('user').map(d => d.path))

  /**
   * Two segments, like everywhere else: a screen, optionally a sub-tab. The
   * allocations step names one, because it shows the view it is describing
   * rather than pointing at the tab that would reach it.
   */
  function screenOf(path: string): string {
    const [, screen = ''] = path.split('/')
    return `/${screen}`
  }

  test.each(TOUR_STEPS)('$id is on a real destination', ({ path }) => {
    expect(userPaths.has(screenOf(path))).toBe(true)
  })

  test.each(TOUR_STEPS)('$id goes no deeper than a sub-tab', ({ path }) => {
    // Three segments would be a place the router cannot name and the shell
    // cannot render — the hard stop the whole app is built on.
    expect(path.replace(/^\//, '').split('/').length).toBeLessThanOrEqual(2)
  })

  test('step ids are unique', () => {
    const ids = TOUR_STEPS.map(s => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  test('there are steps at all', () => {
    expect(TOUR_STEPS.length).toBeGreaterThan(0)
  })
})

/**
 * The rule that keeps the tour working for the person it is for.
 *
 * The app starts empty, so a step anchored to content — a budget row, an
 * account card — points at nothing on a first run, which is precisely the run
 * that matters. Every anchor here has to be chrome: something the shell
 * renders whether or not the vault holds anything.
 *
 * The list is written out rather than derived, so adding an anchor is a
 * deliberate act with this reasoning attached to it.
 *
 * A second rule the dial added: an anchor must also be *visible* at both
 * widths. Below 768px the screen's controls fold away behind a dot, so the eye
 * and the edit toggle are in the document but not on the screen — the dial
 * itself is the anchor, and what is inside it is described rather than ringed.
 */
const CHROME_ANCHORS = new Set(['nav', 'nav-knowledge', 'dial', 'accounts-tabs'])

describe('anchors survive an empty app', () => {
  test.each(TOUR_STEPS.filter(s => s.anchor))('$id points at chrome', ({ anchor }) => {
    expect(CHROME_ANCHORS.has(anchor!)).toBe(true)
  })

  test('the tour ends where it can be restarted', () => {
    // The one step whose absence would be a real failure of the feature: a
    // tour nobody can find again is a tour that has to be right first time.
    expect(TOUR_STEPS.at(-1)?.anchor).toBe('nav-knowledge')
  })
})
