import { describe, test, expect } from 'vitest'
import { loadContent, type PartialContent } from './content'
import { en } from './content/en'
import { ARTICLES } from './registry'
import { TOURS, type TourStepId } from '../tour/steps'

/**
 * Guards the translated content modules.
 *
 * Every mistake this file catches is **silent**. A locale module is `Partial`
 * by design, so a mistyped key is not a type error and not a crash — it is
 * simply a string nothing ever reads, and the reader is quietly shown English
 * instead. The feature then looks finished to whoever wrote it and looks
 * untranslated to whoever uses it, which is the worst pair of outcomes
 * available.
 *
 * Loaded eagerly here, unlike in `content.ts` where each locale is its own
 * lazy chunk: a test wants all of them at once.
 */
const MODULES = import.meta.glob<{ default: PartialContent }>('./content/*.ts', { eager: true })

/** Every locale module except English, which is the complete one they fall back to. */
function translations(): [string, PartialContent][] {
  return Object.entries(MODULES)
    .filter(([path]) => !path.endsWith('/en.ts'))
    .map(([path, module]) => [path.replace('./content/', '').replace('.ts', ''), module.default])
}

/**
 * Every step of every walkthrough. Copy is keyed by step id with no note of
 * which tour it belongs to, so both tours draw on the one pool and both are
 * checked against it.
 */
const ALL_STEPS = Object.values(TOURS).flat()
const STEP_IDS = new Set<string>(ALL_STEPS.map(s => s.id))

/**
 * The steps whose words live here at all. The five type steps take theirs
 * from `TYPE_GUIDES` in the catalogue, so a locale that does not mention them
 * is complete rather than lacking.
 */
const WRITTEN_STEPS = ALL_STEPS.filter(s => !s.guideType)
const ARTICLE_IDS = new Set<string>(ARTICLES.map(a => a.id))

describe('every translation is wired to something real', () => {
  test('there are translations to check', () => {
    // Without this the whole file passes by describing nothing, which is how a
    // guard quietly stops guarding after a refactor moves the files.
    expect(translations().length).toBeGreaterThan(0)
  })

  test.each(translations())('%s uses only real tour step ids', (_locale, content) => {
    const unknown = Object.keys(content.tour ?? {}).filter(id => !STEP_IDS.has(id))
    expect(unknown).toEqual([])
  })

  test.each(translations())('%s uses only real article ids', (_locale, content) => {
    const unknown = Object.keys(content.articles ?? {}).filter(id => !ARTICLE_IDS.has(id))
    expect(unknown).toEqual([])
  })

  /**
   * A half-translated *tour* is worse than an untranslated one: the article
   * sheet can say "shown in English" over one piece, but a tour that changes
   * language between step four and step five just looks broken. So the tour is
   * all-or-nothing per locale, unlike the articles.
   */
  test.each(translations())('%s translates every tour step, or none', (_locale, content) => {
    const translated = Object.keys(content.tour ?? {})
    if (translated.length === 0) return
    const missing = WRITTEN_STEPS.map(s => s.id).filter(id => !translated.includes(id))
    expect(missing).toEqual([])
  })

  test.each(translations())('%s leaves no empty string behind', (_locale, content) => {
    for (const [id, copy] of Object.entries(content.tour ?? {})) {
      expect(copy?.title.trim(), `${id} title`).toBeTruthy()
      expect(copy?.body.trim(), `${id} body`).toBeTruthy()
      expect(copy, id).toBeDefined()
    }
    for (const [id, article] of Object.entries(content.articles ?? {})) {
      expect(article?.title.trim(), `${id} title`).toBeTruthy()
      expect(article?.body.length, `${id} body`).toBeGreaterThan(0)
    }
  })

  test.each(translations())('%s says something different from English', (_locale, content) => {
    // A step copied across untranslated is a gap wearing the look of a
    // translation: the fallback would have produced the same words, and no
    // reviewer scanning the file would spot it.
    const copied = Object.entries(content.tour ?? {})
      .filter(([id, copy]) => copy?.body === en.tour[id as TourStepId]?.body)
      .map(([id]) => id)
    expect(copied).toEqual([])
  })
})

/**
 * Swiss German has no ß. `locales/de.ts` says so at the top and follows it;
 * content written later has no such header to read, and an eszett is the kind
 * of thing that arrives with a paste from a German source and is never noticed
 * by anyone who is not Swiss.
 */
describe('German is written in the Swiss register', () => {
  test('no eszett anywhere in the German content', () => {
    const german = translations().find(([locale]) => locale === 'de')
    expect(german, 'no German module found').toBeDefined()

    const offenders = Object.entries(german![1].tour ?? {})
      .filter(([, copy]) => /ß/.test(`${copy?.title}${copy?.body}`))
      .map(([id]) => id)
    expect(offenders).toEqual([])
  })
})

/**
 * The loader itself, through the real glob.
 *
 * Worth its own tests because until a locale module existed, `loadContent`
 * only ever took the "no chunk for this locale" branch — every call fell
 * straight back to English and the merge below had never run at all. These are
 * the first exercise of the path that actually serves a translated tour.
 */
describe('loading a locale', () => {
  test('English is served whole, and counts as translated', async () => {
    const { content, translated } = await loadContent('en')

    expect(content.tour.welcome?.title).toBe(en.tour.welcome?.title)
    for (const { id } of ARTICLES) expect(translated.has(id)).toBe(true)
  })

  test('German serves German tour copy', async () => {
    const { content } = await loadContent('de')

    expect(content.tour.welcome?.title).not.toBe(en.tour.welcome?.title)
    // Every written step, not just the first: the merge is per key, so a
    // locale that is complete must come back complete.
    for (const step of WRITTEN_STEPS) {
      expect(content.tour[step.id]?.title, step.id).not.toBe(en.tour[step.id]?.title)
    }
  })

  test('German serves German articles', async () => {
    const { content } = await loadContent('de')

    for (const { id } of ARTICLES) {
      expect(content.articles[id].title, id).not.toBe(en.articles[id].title)
    }
  })

  /**
   * The invariant the sheet's "shown in English" notice rests on, stated so
   * that it holds whether or not there are gaps left to demonstrate it.
   *
   * It replaces a test that asserted German had no articles — true when it was
   * written, and quietly meaningless the moment the articles were translated.
   * Claiming a fallback is a translation, or a translation a fallback, are
   * both failures here.
   */
  test.each(['de', 'fr', 'it', 'rm'] as const)(
    '%s reports exactly the articles it actually carries',
    async locale => {
      const { content, translated } = await loadContent(locale)
      const own = MODULES[`./content/${locale}.ts`]?.default.articles ?? {}

      for (const { id } of ARTICLES) {
        const carried = own[id] !== undefined
        expect(translated.has(id), `${locale}/${id}`).toBe(carried)
        // And the merge itself: carried means its own words, otherwise
        // English, never undefined.
        expect(content.articles[id], `${locale}/${id}`).toBeDefined()
        if (!carried) expect(content.articles[id].title).toBe(en.articles[id].title)
      }
    },
  )

  test('a locale with no module at all is English throughout', async () => {
    // Rumantsch has a catalogue but no content module; nothing should throw
    // and nothing should be claimed as translated.
    const { content, translated } = await loadContent('rm')

    expect(content.tour.welcome?.title).toBe(en.tour.welcome?.title)
    expect(translated.size).toBe(0)
  })

  test.each(['fr', 'it'] as const)('%s serves its own tour copy', async locale => {
    const { content } = await loadContent(locale)

    for (const step of WRITTEN_STEPS) {
      expect(content.tour[step.id]?.title, step.id).not.toBe(en.tour[step.id]?.title)
    }
  })
})

/**
 * The two rules that make a Swiss library safe to publish, applied to the
 * translations rather than only to English.
 *
 * `registry.test.ts` checks the English set. It was the whole library when
 * that test was written; it is now a quarter of it, and a figure or a
 * marketing link is no less wrong for being in German.
 */
const OFFICIAL_HOSTS = [/(^|\.)admin\.ch$/, /(^|\.)ch\.ch$/, /(^|\.)paymentstandards\.ch$/]
const AMOUNT = /\b(?:CHF|Fr\.?)\s?\d|\d[\d'’,.]*\s?(?:CHF|Fr\.|francs?|Franken|franchi)\b/i

describe('translated articles keep the Swiss rules', () => {
  const articles = translations().flatMap(([locale, content]) =>
    Object.entries(content.articles ?? {}).map(([id, article]) => ({ locale, id, article })),
  )

  test('there are translated articles to check', () => {
    expect(articles.length).toBeGreaterThan(0)
  })

  test.each(articles)('$locale/$id quotes no amount', ({ article }) => {
    for (const paragraph of article!.body) {
      expect(AMOUNT.test(paragraph), paragraph).toBe(false)
    }
  })

  test.each(articles)('$locale/$id cites only official publishers', ({ article }) => {
    for (const source of article!.sources ?? []) {
      const parsed = new URL(source.url)
      expect(parsed.protocol, source.url).toBe('https:')
      expect(OFFICIAL_HOSTS.some(rx => rx.test(parsed.hostname)), source.url).toBe(true)
    }
  })

  /**
   * A translated article that still links the English page is a translation
   * left half done — and it is invisible, because the link works.
   */
  test.each(articles)('$locale/$id links its own language', ({ locale, id, article }) => {
    const english = en.articles[id as keyof typeof en.articles]?.sources ?? []
    if (english.length === 0) return
    const englishUrls = new Set(english.map(s => s.url))
    const reused = (article!.sources ?? []).filter(s => englishUrls.has(s.url)).map(s => s.url)
    expect(reused, `${locale}/${id} still points at the English page`).toEqual([])
  })

  test.each(articles)('$locale/$id keeps every source English had', ({ article, id }) => {
    const english = en.articles[id as keyof typeof en.articles]?.sources ?? []
    expect(article!.sources?.length ?? 0).toBe(english.length)
  })
})

/**
 * A tour link leaves the app, in a new tab, from a card that is otherwise
 * self-contained. Https only, and to the vendor whose browser it explains:
 * a help page that moved is a dead link, but one that moved to somebody else
 * is a link we sent a user to.
 */
describe('links in tour steps', () => {
  const ALLOWED = ['support.apple.com', 'support.google.com']
  const all = [['en', en] as [string, PartialContent], ...translations()]

  test.each(all)('%s links only to the vendors’ own help', (_locale, content) => {
    for (const [id, copy] of Object.entries(content.tour ?? {})) {
      for (const link of copy?.links ?? []) {
        const url = new URL(link.url)
        expect(url.protocol, id).toBe('https:')
        expect(ALLOWED, `${id}: ${link.url}`).toContain(url.hostname)
        expect(link.label.trim(), id).toBeTruthy()
      }
    }
  })
})
