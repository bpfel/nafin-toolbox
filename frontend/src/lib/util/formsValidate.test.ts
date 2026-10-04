import { describe, test, expect } from 'vitest'

/**
 * Guards the rule that every form is `novalidate`.
 *
 * A form left to the browser's own checks — `required`, `minlength`,
 * `type="email"` — refuses to submit when one fails and is meant to show a
 * bubble saying which. Firefox on Android refuses and shows nothing. The button
 * does nothing, nothing reaches the server, and there is no code to read out:
 * on the phone the invite form and the first password change both went dead
 * that way, over a password that was too short.
 *
 * So the checks are the app's own, where they can say what is wrong — the
 * server's coded errors, and `lib/auth/rules.ts` where a rule must be checked
 * before sending. The attributes stay on the inputs for the keyboard and the
 * screen reader; `novalidate` only stops them blocking the submit.
 *
 * jsdom does not run the browser's checks either, so no component test can
 * notice a form that lost the attribute. This looks for it instead.
 */

const COMPONENTS = import.meta.glob('/src/**/*.svelte', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

describe('the browser never silently blocks a form', () => {
  test('every form is novalidate', () => {
    const offenders: string[] = []

    for (const [path, source] of Object.entries(COMPONENTS)) {
      for (const tag of source.match(/<form\b[^>]*>/g) ?? []) {
        if (!/\bnovalidate\b/.test(tag)) offenders.push(`${path} — ${tag}`)
      }
    }

    expect(offenders).toEqual([])
  })
})
