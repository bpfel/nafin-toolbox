import { describe, test, expect } from 'vitest'

/**
 * Guards the three colours that were unreadable, and the way they got there.
 *
 * `#888` at 3.54:1 and `#999` at 2.85:1 against white are both short of the
 * 4.5:1 that small text needs, and `#b3641a` — an amber I added by eye — missed
 * by 0.08. None of them was a careless choice; they were all values that looked
 * fine on the screen they were written on. That is exactly the failure a token
 * prevents and a person does not.
 *
 * Deliberately narrow: it forbids the three known-bad values rather than
 * demanding every colour be a token, because seventy-odd inline greys and
 * borders are still to be migrated and a test nobody can make pass is a test
 * that gets deleted.
 */

const COMPONENTS = import.meta.glob('/src/**/*.{svelte,css}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

/** Relative luminance, per WCAG 2.x. */
function luminance(hex: string): number {
  const value = hex.replace('#', '')
  const full = value.length === 3 ? [...value].map(c => c + c).join('') : value
  const channels = [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16) / 255)
  const linear = channels.map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]
}

function contrastOnWhite(hex: string): number {
  return (1 + 0.05) / (luminance(hex) + 0.05)
}

const RETIRED = ['#888', '#999', '#b3641a']

describe('colours that cannot be read do not come back', () => {
  test.each(RETIRED)('%s is below AA and is not used', (hex) => {
    expect(contrastOnWhite(hex)).toBeLessThan(4.5)

    const offenders = Object.entries(COMPONENTS)
      .filter(([, source]) => new RegExp(`${hex}\\b`, 'i').test(source))
      .map(([path]) => `${path} — use a token instead of ${hex}`)

    expect(offenders.length, `\n${offenders.join('\n')}\n`).toBe(0)
  })

  test('the tokens that replaced them clear AA', () => {
    // --ink-faint, --warn, and the three that say where money goes.
    for (const [name, hex] of [
      ['--ink-faint', '#6e737b'],
      ['--warn', '#8f4f13'],
      ['--money-in', '#2d6a4f'],
      ['--money-held', '#1d4e89'],
      ['--alarm', '#c0392b'],
    ] as const) {
      expect(contrastOnWhite(hex), `${name} (${hex})`).toBeGreaterThanOrEqual(4.5)
    }
  })
})
