import { describe, test, expect } from 'vitest'

/**
 * Guards the rule that every rendered franc amount goes through `<Money>`, or at
 * least through `formatAmount`.
 *
 * It did not, for a long time. The de-CH formatter was copy-pasted into twelve
 * components, each having drifted slightly — one guarded a non-numeric value,
 * one divided centimes, one took an absolute value, and the rest rendered 'NaN'
 * at the user.
 *
 * Keeping them together matters more now than it did then, because the
 * hide-amounts toggle blurs figures by finding them: every amount carries the
 * `.money` class that `<Money>` puts there, and a figure formatted by hand
 * carries nothing. It would sit sharp and legible among its blurred neighbours,
 * and nobody would find out until they were reading their salary to a train
 * carriage — the failure is invisible in every test that does not look for it,
 * which is why this looks for it.
 *
 * What it cannot see, in the same spirit as the untranslated-string scan: an
 * amount rendered as a bare string with no formatting at all. `{entry.amount}`
 * prints '1234.5' and no pattern here objects, because there is nothing to
 * object to — it is only wrong against a convention the code does not state.
 */

const COMPONENTS = import.meta.glob('/src/**/*.svelte', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

/**
 * The two ways to turn a number into localised text. `toFixed` is deliberately
 * absent: components use it to produce the canonical *stored* string — the form
 * the vault and the QR bill standard demand — which is a different job from
 * showing a figure to somebody.
 */
const FORMATTERS = [
  { pattern: /minimumFractionDigits/, what: 'toLocaleString with fraction digits' },
  { pattern: /Intl\.NumberFormat/, what: 'Intl.NumberFormat' },
]

describe('every rendered amount goes through Money', () => {
  test('no component formats a franc amount by hand', () => {
    const offenders: string[] = []

    for (const [path, source] of Object.entries(COMPONENTS)) {
      for (const { pattern, what } of FORMATTERS) {
        if (pattern.test(source)) {
          offenders.push(`${path} — ${what}; use <Money> or formatAmount()`)
        }
      }
    }

    expect(offenders.length, `\n${offenders.join('\n')}\n`).toBe(0)
  })
})
