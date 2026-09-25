/**
 * The figures in this build that carry a date, and when each stops being true.
 *
 * The app refuses to invent Swiss facts — an article states the structure and
 * links whoever publishes the number. But the *seeded* budget cannot do that:
 * a starter budget with no amounts in it teaches nothing, so a handful of real
 * figures are compiled in. Each of those is correct on the day it is written
 * and wrong some later day, and until now the only record of which day was a
 * comment above the line.
 *
 * A comment is read by whoever is already editing the file, which is precisely
 * the person who does not need reminding. This is the same knowledge pointed
 * at the person who does.
 *
 * **It changes nothing by itself.** Content stays build-only: the register
 * names the file to edit and the page that publishes the truth, and a human
 * cuts a release. Nothing here reaches into the vault, the database, or the
 * seeds.
 */
export interface UpkeepSource {
  label: string
  url: string
}

export interface UpkeepEntry {
  id: string
  /** The figure, named the way an administrator would say it. */
  subject: string
  /** What this build currently claims. */
  current: string
  /** What it becomes, where that is already published. */
  becomes?: string
  /**
   * The day `current` stops being true, as `YYYY-MM-DD`.
   *
   * Absent when the figure changes on nobody's schedule — a price that moves
   * when an operator decides it does. Those get a `cadence` instead, because
   * "no date" and "never changes" are not the same thing and a register that
   * conflated them would quietly drop the ones worth watching hardest.
   */
  changesOn?: string
  /** How often to look, for an entry with no date. */
  cadence?: string
  /**
   * Where the figure lives, relative to `frontend/src`. Checked against the
   * real files by `register.test.ts`, so a moved file cannot leave the
   * register pointing at nothing.
   */
  where: string[]
  /** Who publishes the figure this build is copying. */
  source: UpkeepSource
}

export const UPKEEP: UpkeepEntry[] = [
  {
    id: 'serafe',
    subject: 'Serafe household levy',
    current: "CHF 335.00 a year, seeded as 27.92 a month",
    becomes: "CHF 312.00 a year",
    changesOn: '2027-01-01',
    where: ['lib/budget/budgetEngine.ts'],
    source: { label: 'BAKOM — Abgabe für Radio und Fernsehen', url: 'https://www.bakom.admin.ch/de/abgabe' },
  },
  {
    id: 'pillar-3a-cap',
    subject: 'Pillar 3a maximum deduction',
    current: "CHF 7'056 a year for an employee, seeded as 588.00 a month",
    cadence: 'Set federally and announced for the coming year, so worth a look each autumn.',
    where: ['lib/budget/budgetEngine.ts'],
    source: {
      label: 'ESTV — Höchstabzüge Säule 3a',
      url: 'https://www.estv.admin.ch/de/zinssaetze-hoechstabzuege-saeule-3a-direkte-bundessteuer',
    },
  },
  {
    id: 'ga-travelcard',
    subject: 'GA travelcard, second class',
    current: "CHF 3'995 a year, seeded as 332.92 a month",
    cadence: 'Repriced by SBB on no fixed schedule, usually alongside a timetable change.',
    where: ['lib/budget/seedNames.ts', 'lib/budget/budgetEngine.ts'],
    source: { label: 'SBB — Generalabonnement', url: 'https://www.sbb.ch/de/billette-angebote/abos/ga.html' },
  },
  {
    id: 'habe-survey',
    subject: 'Household budget figures',
    current: 'HABE 2023, single person — rent, food, transport and the rest of the personal starter plan',
    cadence: 'The BFS publishes a new wave every few years; the setup screen names the one in use.',
    where: ['lib/budget/budgetEngine.ts'],
    source: {
      label: 'BFS — Haushaltsbudgeterhebung',
      url: 'https://www.bfs.admin.ch/bfs/de/home/statistiken/wirtschaftliche-soziale-situation-bevoelkerung/einkommen-verbrauch-vermoegen/haushaltsbudget.html',
    },
  },
  {
    id: 'habe-household',
    subject: 'Household budget figures, two people',
    current:
      'HABE 2020–2021, couples under 65 without children — rent 1238.54, service charges 145.12, ' +
      'electricity 70.58, heating 36.02, food 715.63, household insurance 41.95, inventory 201.84. ' +
      'Francs a month per household, from table je-d-20.02.01.02.13. Health insurance is in the ' +
      'survey at 688.67 and deliberately not seeded: the premium is per person.',
    // A separate entry from the one above, and a separate wave, because it has
    // to be. The annual HABE sample is around three thousand households, too
    // small to break down by household type, so the BFS pools three years for
    // these columns — which means the household seed is always a wave or two
    // behind the personal one and the two cannot be updated in one go.
    cadence: 'Pooled over three years and republished as a new wave lands; worth a look when the annual HABE does.',
    where: ['lib/budget/budgetEngine.ts', 'lib/budget/seedNames.ts'],
    source: {
      label: 'BFS — Detaillierte Haushaltsausgaben nach Haushaltstyp',
      url: 'https://www.bfs.admin.ch/bfs/de/home/statistiken/wirtschaftliche-soziale-situation-bevoelkerung/einkommen-verbrauch-vermoegen/haushaltsbudget/haushaltsausgaben.html',
    },
  },
]

/**
 * `overdue` — the day has passed and the build is now saying something untrue.
 * `due` — close enough to be worth doing before it is.
 * `scheduled` — dated, but not yet.
 * `undated` — changes on nobody's calendar; check it when the cadence says.
 */
export type UpkeepStatus = 'overdue' | 'due' | 'scheduled' | 'undated'

/** How long before the day an entry starts asking to be dealt with. */
export const DUE_WITHIN_DAYS = 90

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Compared as dates, not as strings.
 *
 * `'2027-01-01' <= today` would be true of `'2026-12-31'` too, and lexical
 * comparison is right only for as long as every date is the same shape — which
 * it is today and would stop being the first time somebody wrote a month
 * without its leading zero.
 */
export function statusOf(entry: UpkeepEntry, today: string): UpkeepStatus {
  if (!entry.changesOn) return 'undated'

  const days = (Date.parse(entry.changesOn) - Date.parse(today)) / DAY_MS
  if (Number.isNaN(days)) return 'undated'
  if (days <= 0) return 'overdue'
  return days <= DUE_WITHIN_DAYS ? 'due' : 'scheduled'
}

const ORDER: Record<UpkeepStatus, number> = { overdue: 0, due: 1, scheduled: 2, undated: 3 }

/**
 * Worst first, then soonest.
 *
 * An undated entry sorts last and not out: it has no day to be late for, which
 * makes it easy to ignore and is exactly why it belongs on a list somebody
 * reads rather than in a comment nobody opens.
 */
export function forReview(today: string, entries: UpkeepEntry[] = UPKEEP): UpkeepEntry[] {
  return [...entries].sort((a, b) => {
    const byStatus = ORDER[statusOf(a, today)] - ORDER[statusOf(b, today)]
    if (byStatus !== 0) return byStatus
    return (a.changesOn ?? '9999').localeCompare(b.changesOn ?? '9999')
  })
}

/** What a reminder is worth sending about. */
export function needsAttention(today: string, entries: UpkeepEntry[] = UPKEEP): UpkeepEntry[] {
  return forReview(today, entries).filter(e => {
    const status = statusOf(e, today)
    return status === 'overdue' || status === 'due'
  })
}
