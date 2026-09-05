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

/** Everything outside `<script>` — where a figure is rendered rather than computed. */
function markupOf(source: string): string {
  return source
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
}

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

describe('every rendered amount can be hidden', () => {
  /**
   * The companion rule. `<Money>` blurs itself, but an amount interpolated into
   * a sentence — "CHF 380.00 short of the tax bill" — cannot be a component, so
   * the element holding that sentence has to carry the class instead.
   *
   * Forgetting is silent and stays silent: the figure sits sharp among blurred
   * neighbours, every test passes, and the first person to find out is whoever
   * turned hiding on precisely because someone was reading over their shoulder.
   *
   * Coarse on purpose — it asks whether a component that renders a prose amount
   * knows about hiding at all, not whether every one of them is marked. A file
   * with two such sentences that marks only one still passes, and a component
   * that formats in `<script>` and renders the result through a variable is
   * invisible to it. It catches the whole-component omission, which is the one
   * that actually happens when a screen is written.
   */
  test('a component that prints an amount in prose knows how to hide it', () => {
    const offenders: string[] = []

    for (const [path, source] of Object.entries(COMPONENTS)) {
      if (path.endsWith('/Money.svelte')) continue
      if (!markupOf(source).includes('formatAmount(')) continue
      if (source.includes('amountsHidden')) continue

      offenders.push(
        `${path} — renders formatAmount() in markup without amountsHidden(); ` +
          'the sentence around it needs class:amount-hidden',
      )
    }

    expect(offenders.length, `\n${offenders.join('\n')}\n`).toBe(0)
  })
})
