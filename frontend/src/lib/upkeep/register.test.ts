import { describe, test, expect } from 'vitest'
import { UPKEEP, DUE_WITHIN_DAYS, forReview, needsAttention, statusOf, type UpkeepEntry } from './register'

/**
 * A register of things that go stale is itself a thing that goes stale.
 *
 * Every check here exists because the failure it prevents is silent: an entry
 * pointing at a file that has been renamed, a source that has rotted, a date
 * in a shape the comparison does not understand. None of those break the
 * screen. They just make it quietly wrong, which is worse than not having it,
 * because an administrator would be trusting it.
 */
const SOURCES = import.meta.glob('/src/**/*.ts', { query: '?raw', import: 'default', eager: true })

describe('the register points at things that exist', () => {
  test('every entry names a file that is really there', () => {
    const missing = UPKEEP.flatMap(e =>
      e.where.filter(path => !(`/src/${path}` in SOURCES)).map(path => `${e.id} → ${path}`),
    )
    expect(missing).toEqual([])
  })

  test('every entry has somewhere to look up the truth', () => {
    for (const entry of UPKEEP) {
      expect(entry.source.label.trim(), entry.id).toBeTruthy()
      expect(new URL(entry.source.url).protocol, entry.id).toBe('https:')
    }
  })

  test('ids are unique', () => {
    const ids = UPKEEP.map(e => e.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  test('a dated entry is dated in the one shape the comparison understands', () => {
    for (const entry of UPKEEP) {
      if (!entry.changesOn) continue
      expect(entry.changesOn, entry.id).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(Number.isNaN(Date.parse(entry.changesOn)), entry.id).toBe(false)
    }
  })

  /**
   * An entry with neither is one nobody will ever be told to look at: no day
   * to be late for, and no instruction for how often to check instead.
   */
  test('an entry says either when it changes or how often to look', () => {
    const silent = UPKEEP.filter(e => !e.changesOn && !e.cadence).map(e => e.id)
    expect(silent).toEqual([])
  })

  test('the figure it currently claims is stated', () => {
    for (const entry of UPKEEP) expect(entry.current.trim(), entry.id).toBeTruthy()
  })
})

const on = (changesOn?: string, id = 'x'): UpkeepEntry => ({
  id,
  subject: 's',
  current: 'c',
  changesOn,
  cadence: changesOn ? undefined : 'whenever',
  where: [],
  source: { label: 'l', url: 'https://example.ch' },
})

describe('reading a date against today', () => {
  const TODAY = '2026-09-22'

  test('a day that has passed is overdue', () => {
    expect(statusOf(on('2026-09-21'), TODAY)).toBe('overdue')
  })

  test('today itself is overdue, because the build is already saying it', () => {
    expect(statusOf(on('2026-09-22'), TODAY)).toBe('overdue')
  })

  test('within the window is due', () => {
    expect(statusOf(on('2026-11-01'), TODAY)).toBe('due')
  })

  test('beyond it is merely scheduled', () => {
    expect(statusOf(on('2027-06-01'), TODAY)).toBe('scheduled')
  })

  test('the window edge falls on the due side', () => {
    const edge = new Date(Date.parse(TODAY) + DUE_WITHIN_DAYS * 86400000)
      .toISOString()
      .slice(0, 10)
    expect(statusOf(on(edge), TODAY)).toBe('due')
  })

  test('no date is undated, not overdue', () => {
    // The distinction the whole register turns on: a figure that changes on
    // nobody's schedule is not a figure that has already changed.
    expect(statusOf(on(undefined), TODAY)).toBe('undated')
  })

  /**
   * Dates are compared as dates. Lexically, '2026-9-30' sorts before
   * '2026-12-01' and a single missing zero would put an overdue entry into
   * next year without anything failing.
   */
  test('a date is not compared as a string', () => {
    expect(statusOf(on('2026-9-30'), TODAY)).not.toBe('scheduled')
  })
})

describe('what an administrator is shown first', () => {
  const TODAY = '2026-09-22'
  const entries = [
    on('2027-06-01', 'later'),
    on(undefined, 'undated'),
    on('2026-01-01', 'overdue'),
    on('2026-10-01', 'due'),
  ]

  test('worst first, then soonest', () => {
    expect(forReview(TODAY, entries).map(e => e.id)).toEqual(['overdue', 'due', 'later', 'undated'])
  })

  test('the undated one is last and not missing', () => {
    expect(forReview(TODAY, entries)).toHaveLength(entries.length)
  })

  test('a reminder carries only what is overdue or due', () => {
    expect(needsAttention(TODAY, entries).map(e => e.id)).toEqual(['overdue', 'due'])
  })

  test('nothing pressing means nothing to send', () => {
    expect(needsAttention(TODAY, [on('2028-01-01'), on(undefined)])).toEqual([])
  })
})

describe('the register as it actually stands', () => {
  test('the Serafe change this build was written against is in it', () => {
    // The entry the register exists for: a figure with a published date that
    // nothing else in the app would have reminded anybody about.
    const serafe = UPKEEP.find(e => e.id === 'serafe')!

    expect(serafe.changesOn).toBe('2027-01-01')
    expect(serafe.becomes).toContain('312')
  })

  test('every seeded figure that carries a date is listed', () => {
    // Not a count for its own sake: these five are what `budgetEngine` and
    // `seedNames` compile in, and an unlisted sixth is one nobody is watching.
    //
    // Two HABE entries rather than one, because the two starter budgets cannot
    // be updated together: the annual sample is too small to break down by
    // household type, so the household figures come from a three-year pooled
    // wave that lags the personal ones.
    expect(UPKEEP.map(e => e.id).sort()).toEqual([
      'ga-travelcard',
      'habe-household',
      'habe-survey',
      'pillar-3a-cap',
      'serafe',
    ])
  })
})
