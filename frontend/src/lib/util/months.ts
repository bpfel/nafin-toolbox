import { getLocale } from '../i18n/index.svelte'

/**
 * Month names, in the language the interface is in.
 *
 * They used to be a twelve-string English array, copied into two components and
 * shipped untranslated in all four languages — a hole the untranslated-string
 * scan could not see, because a `const` of bare strings in `<script>` looks
 * exactly like any other data.
 *
 * `Intl` rather than a catalogue of forty-eight slugs: month names are the one
 * kind of word every runtime already knows, and a slug per month would be
 * forty-eight chances to mistype one.
 *
 * Unlike amounts, these *do* follow the interface language. A franc is written
 * the Swiss way whatever you are reading in — that is what is printed on the
 * bank statement beside you — but "March" is a word, and words are translated.
 */
function formatter(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(getLocale(), { ...options, timeZone: 'UTC' })
}

/** The twelve names, January first, for a picker. */
export function monthNames(): string[] {
  const format = formatter({ month: 'long' })
  return Array.from({ length: 12 }, (_, i) => format.format(Date.UTC(2000, i, 1)))
}

/**
 * A stored 'YYYY-MM' as something to read: "March 2027".
 *
 * Anything that is not a month comes back unchanged rather than as an invalid
 * date, so a corrupt anchor shows as itself.
 */
export function monthLabel(month: string): string {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month)
  if (!match) return month
  const [, year, index] = match
  return formatter({ month: 'long', year: 'numeric' }).format(
    Date.UTC(Number(year), Number(index) - 1, 1),
  )
}

/** Just the name, for a picker that asks only which month. */
export function monthNameOf(monthIndex: string): string {
  const index = Number(monthIndex)
  if (!Number.isInteger(index) || index < 1 || index > 12) return monthIndex
  return monthNames()[index - 1]
}
