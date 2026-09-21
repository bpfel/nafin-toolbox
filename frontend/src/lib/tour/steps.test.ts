import { describe, test, expect } from 'vitest'
import { TOUR_STEPS, numbering } from './steps'
import { destinationsFor } from '../nav/destinations'
import { createEmptyVault } from '../crypto/vault'
import { seedDefaults } from '../budget/budgetEngine'

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

/**
 * The one exception, and the terms it is allowed on.
 *
 * The five type sections are content, not chrome — they exist only when the
 * budget has an entry of that type. That is permitted here because the step
 * introducing them carries `needsExampleBudget`, so the tour fills an empty
 * budget with the Swiss defaults first, and those defaults now carry one
 * entry of every type. Both halves of that bargain are asserted below; drop
 * either and these steps start pointing at nothing.
 */
const SEEDED_ANCHORS = new Set([
  'type-income',
  'type-expense',
  'type-savings',
  'type-bill',
  'type-purchase',
])

describe('anchors survive an empty app', () => {
  test.each(TOUR_STEPS.filter(s => s.anchor))('$id points at chrome or at seeded data', ({ anchor }) => {
    expect(CHROME_ANCHORS.has(anchor!) || SEEDED_ANCHORS.has(anchor!)).toBe(true)
  })

  test('something earlier in the tour asks for the example budget', () => {
    const seeds = TOUR_STEPS.findIndex(s => s.needsExampleBudget)
    const firstSeeded = TOUR_STEPS.findIndex(s => s.anchor && SEEDED_ANCHORS.has(s.anchor))

    expect(seeds, 'no step seeds the example budget').toBeGreaterThanOrEqual(0)
    expect(seeds).toBeLessThan(firstSeeded)
  })

  test('the seeded defaults really do cover every anchored type', () => {
    // The other half of the bargain. If a type stops being seeded, its step
    // silently disappears from the tour rather than failing anywhere.
    const vault = createEmptyVault()
    seedDefaults(vault)
    const seeded = new Set(vault.budget.entries.map(e => `type-${e.type}`))

    for (const step of TOUR_STEPS) {
      if (step.anchor && SEEDED_ANCHORS.has(step.anchor)) {
        expect(seeded.has(step.anchor), step.id).toBe(true)
      }
    }
  })

  test('the tour ends where it can be restarted', () => {
    // The one step whose absence would be a real failure of the feature: a
    // tour nobody can find again is a tour that has to be right first time.
    expect(TOUR_STEPS.at(-1)?.anchor).toBe('nav-knowledge')
  })
})

/**
 * The counter, which is the only thing telling a reader how much is left.
 *
 * Thirteen steps counted one by one reads as a slog; eight topics, one of
 * which has five parts, reads as a structure. Asserted on a fixture rather
 * than on the real list, so rewording the tour does not rewrite this test —
 * and then once against the real list, for the property that actually
 * matters.
 */
describe('numbering the steps', () => {
  const fixture = [
    { id: 'a', path: '/budget' },
    { id: 'b', path: '/budget' },
    { id: 'b1', path: '/budget', sub: true },
    { id: 'b2', path: '/budget', sub: true },
    { id: 'c', path: '/budget' },
  ] as unknown as typeof TOUR_STEPS

  test('sub-steps take the number of the step they belong to', () => {
    expect(numbering(fixture).map(n => n.label)).toEqual(['1', '2', '2.1', '2.2', '3'])
  })

  test('the total counts topics, not steps', () => {
    for (const n of numbering(fixture)) expect(n.total).toBe(3)
  })

  test('the real tour has fewer topics than steps', () => {
    const { total } = numbering().at(-1)!
    expect(total).toBeLessThan(TOUR_STEPS.length)
    expect(numbering()).toHaveLength(TOUR_STEPS.length)
  })

  test('no sub-step opens the tour', () => {
    // A step numbered 0.1 is what a stray `sub: true` on the first entry
    // would produce, and the counter would read nonsense from step one.
    expect(TOUR_STEPS[0].sub).toBeUndefined()
  })
})
