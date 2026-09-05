import { describe, test, expect } from 'vitest'

/**
 * Guards the one property a dialog cannot do without.
 *
 * A dialog taller than the screen is a dialog whose buttons are off the bottom
 * of it, with no way to scroll to them — the form is filled in and cannot be
 * submitted. It is invisible on a desktop, where dialogs are short relative to
 * the window, and total on a phone.
 *
 * Four of ten were missing it, including the add-entry dialog, which had just
 * grown to fourteen inputs for a purchase. Nobody wrote a dialog intending it
 * to be unscrollable; they wrote it by not thinking about a case a wide screen
 * never shows you.
 */

const COMPONENTS = import.meta.glob('/src/**/*.svelte', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

describe('every dialog can be scrolled to its own buttons', () => {
  test('a role="dialog" surface bounds its height and scrolls', () => {
    const offenders: string[] = []

    for (const [path, source] of Object.entries(COMPONENTS)) {
      if (!source.includes('role="dialog"')) continue
      const bounded = /max-height:\s*\d/.test(source)
      const scrolls = /overflow-y:\s*auto/.test(source)
      if (bounded && scrolls) continue

      offenders.push(
        `${path} — needs max-height and overflow-y: auto on the dialog surface` +
          `${bounded ? '' : ' (no max-height)'}${scrolls ? '' : ' (no overflow-y)'}`,
      )
    }

    expect(offenders.length, `\n${offenders.join('\n')}\n`).toBe(0)
  })
})
