import { describe, test, expect } from 'vitest'
import { TOURS, TOUR_STEPS, numbering, type TourStep } from './steps'
import { destinationsFor } from '../nav/destinations'
import { createEmptyVault } from '../crypto/vault'
import { seedDefaults, seedSharedDefaults } from '../budget/budgetEngine'

/**
 * Every tour, flattened, for the rules that hold of any step whatever tour it
 * is in — and the tours separately, for the rules about a tour's shape.
 *
 * Derived from `TOURS` rather than written out, so a third walkthrough is
 * covered by all of this the moment it is added rather than the moment
 * somebody remembers this file.
 */
const EVERY_STEP: TourStep[] = Object.values(TOURS).flat()
const EVERY_TOUR = Object.entries(TOURS)

/** Which seeder a step's `example` names. */
const SEEDERS = { personal: seedDefaults, shared: seedSharedDefaults }

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

  test.each(EVERY_STEP)('$id is on a real destination', ({ path }) => {
    expect(userPaths.has(screenOf(path))).toBe(true)
  })

  test.each(EVERY_STEP)('$id goes no deeper than a sub-tab', ({ path }) => {
    // Three segments would be a place the router cannot name and the shell
    // cannot render — the hard stop the whole app is built on.
    expect(path.replace(/^\//, '').split('/').length).toBeLessThanOrEqual(2)
  })

  test('step ids are unique across every tour', () => {
    // Across, not within: copy is keyed by step id alone, so the same id in
    // two tours would have them silently share a card.
    const ids = EVERY_STEP.map(s => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  test.each(EVERY_TOUR)('%s has steps at all', (_id, steps) => {
    expect(steps.length).toBeGreaterThan(0)
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
const CHROME_ANCHORS = new Set([
  'nav',
  'nav-knowledge',
  'dial',
  'accounts-tabs',
  // The household card on Profile. Chrome by the same test as the rest: it is
  // rendered whether or not there are any households, because a screen with
  // nothing in it still explains what it is for.
  'household',
])

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
  test.each(EVERY_STEP.filter(s => s.anchor))('$id points at chrome or at seeded data', ({ anchor }) => {
    expect(CHROME_ANCHORS.has(anchor!) || SEEDED_ANCHORS.has(anchor!)).toBe(true)
  })

  test.each(EVERY_TOUR)('%s seeds its example before it points at one', (_id, steps) => {
    const seeds = steps.findIndex(s => s.example)
    const firstSeeded = steps.findIndex(s => s.anchor && SEEDED_ANCHORS.has(s.anchor))

    // A tour that never points at budget content needs no example at all.
    if (firstSeeded < 0) return

    expect(seeds, 'no step seeds the example budget').toBeGreaterThanOrEqual(0)
    expect(seeds).toBeLessThan(firstSeeded)
  })

  /**
   * Both halves of the bargain, per tour and against the example that tour
   * actually asks for.
   *
   * The halo rings a section heading plus its *first* row, so a type with no
   * entry would leave the step ringing a heading and nothing else — which
   * reads as a mistake rather than as an example. And if a type stops being
   * seeded, its step disappears from the tour silently rather than failing
   * anywhere, which is why the check runs from the seeder rather than from a
   * list written beside it.
   */
  test.each(EVERY_TOUR)('%s rings only sections its own example fills', (_id, steps) => {
    const example = steps.find(s => s.example)?.example
    const anchored = steps.filter(s => s.anchor && SEEDED_ANCHORS.has(s.anchor))
    if (anchored.length === 0) return

    const vault = createEmptyVault()
    SEEDERS[example!](vault)

    for (const step of anchored) {
      const type = step.anchor!.replace('type-', '')
      expect(vault.budget.entries.filter(e => e.type === type).length, step.id).toBeGreaterThan(0)
    }
  })

  /**
   * A hole is cut from the halo's geometry, so a permeable step with nothing
   * to point at would leave the blocker whole and the promise of hovering
   * unkeepable — silently, since nothing fails.
   */
  test.each(EVERY_STEP.filter(s => s.permeable))('$id has something to point at', ({ anchor }) => {
    expect(anchor).toBeDefined()
  })

  test.each(EVERY_TOUR)('%s ends where it can be restarted', (_id, steps) => {
    // The one step whose absence would be a real failure of the feature: a
    // tour nobody can find again is a tour that has to be right first time.
    expect(steps.at(-1)?.anchor).toBe('nav-knowledge')
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

  test.each(EVERY_TOUR)('no sub-step opens %s', (_id, steps) => {
    // A step numbered 0.1 is what a stray `sub: true` on the first entry
    // would produce, and the counter would read nonsense from step one.
    expect(steps[0].sub).toBeUndefined()
  })
})
