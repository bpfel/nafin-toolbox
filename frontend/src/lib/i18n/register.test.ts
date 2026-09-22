import { describe, test, expect } from 'vitest'

/**
 * The app addresses people informally: du, tu, tu.
 *
 * Guarded because register is not the kind of thing a reviewer notices in a
 * diff of one string. Somebody adding a German label will write "Geben Sie"
 * without thinking — it is what every other Swiss app says — and one formal
 * sentence among ninety informal ones reads as a mistake rather than as a
 * style.
 *
 * Read as raw text rather than through the catalogues, so a slip is reported
 * with the line that contains it.
 */
const FILES = import.meta.glob('/src/lib/{i18n/locales,knowledge/content}/{de,fr,it}.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

/** Only the values. A doc comment may discuss the formal forms it forbids. */
function strings(source: string): { line: number; text: string }[] {
  return source.split('\n').flatMap((line, i) => {
    if (/^\s*(\*|\/\/)/.test(line)) return []
    return [...line.matchAll(/'((?:[^'\\]|\\.)*)'/g)].map(m => ({ line: i + 1, text: m[1] }))
  })
}

/**
 * German is the awkward one: `Sie` is also "she" and "they", and capitalised
 * at the start of a sentence it is indistinguishable from the formal address.
 * Three strings rely on that — "Sie hilft" of a kind of account, "Sie behält"
 * of a snapshot, "Sie ist gedeckelt" of pillar 3a — so the formal *verb*
 * pattern is matched instead, which those cannot produce.
 */
const FORMAL: Record<string, RegExp> = {
  de: /\bIhre[nmrs]?\b|\bIhnen\b|\b[A-ZÄÖÜ][a-zäöüß]+en Sie\b|\bSie (können|haben|sind|müssen|möchten|werden)\b/,
  fr: /\b[Vv]ous\b|\b[Vv]otre\b|\b[Vv]os\b/,
  it: /\bLei\b|\b[Vv]ostr[oaie]\b/,
}

describe('every language addresses the reader informally', () => {
  const entries = Object.entries(FILES)

  test('there are catalogues to check', () => {
    // Six files: three locales, catalogue and content each.
    expect(entries.length).toBe(6)
  })

  test.each(entries)('%s', (path, source) => {
    const locale = path.match(/\/(de|fr|it)\.ts$/)![1]
    const offenders = strings(source)
      .filter(s => FORMAL[locale].test(s.text))
      .map(s => `${path}:${s.line} ${s.text.slice(0, 70)}`)

    expect(offenders, `\n${offenders.join('\n')}\n`).toEqual([])
  })
})
