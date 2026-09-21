import type { Locale } from '../i18n/index.svelte'
import type { ArticleId } from './registry'
import type { TourStepId } from '../tour/steps'
import { en } from './content/en'

/**
 * The library's prose, and the loader that fetches a locale's worth of it.
 *
 * **Why this is not in `en.ts` with everything else.** The four full catalogues
 * are typed against the English one, so a slug missing from German is a build
 * failure. That contract is exactly right for interface labels — a button
 * reading `budget.save` in production is a bug worth failing CI over — and
 * exactly wrong for a library of articles, where it would mean no article can
 * be published until it has been translated four times, and where `en.ts`
 * would roughly double in size with prose nobody greps for.
 *
 * So: labels stay slugs, prose comes here, and the bargain is the one
 * Rumantsch already has in the catalogue. English is complete; every other
 * locale is `Partial` and shows English through its gaps, with the sheet saying
 * so rather than passing the fallback off as a translation.
 *
 * Loaded lazily, one chunk per locale. Articles are not needed to render any
 * screen and most sessions will never open one.
 */
export interface Article {
  title: string
  /** Short paragraphs, rendered as `<p>`. Deliberately not markdown. */
  body: string[]
  /**
   * Where the authority for this actually lives.
   *
   * Required on anything describing Swiss rules, and the reason the library can
   * be useful without being dangerous: figures that vary by year, canton or
   * personal situation are *linked*, never quoted. A cap written into this file
   * is wrong the January after it is written, and a user who trusts it has been
   * misled by us rather than by the internet.
   *
   * `registry.test.ts` holds sources to official domains.
   */
  sources?: { label: string; url: string }[]
}

export interface TourCopy {
  title: string
  body: string
  /**
   * A sentence shown only at the wide layout.
   *
   * It exists for one thing — telling someone they can hover a control to
   * find out what it does — which is advice a phone cannot act on: there is
   * no hover, and the controls are behind the dial's dot rather than laid out
   * in a row to point at.
   *
   * Keyed off the 768px layout rather than a `(hover: hover)` query, so it
   * follows the breakpoint the rest of the shell already turns on. A touch
   * laptop is therefore told about hovering, which is harmless; a phone is
   * not, which is the case that matters.
   */
  hoverNote?: string
}

export interface Content {
  articles: Record<ArticleId, Article>
  /**
   * Partial, and not because English is allowed gaps.
   *
   * Five steps take their words from `TYPE_GUIDES` in the catalogue instead —
   * the app already explains every budget type there, in four languages, and
   * saying it twice would leave the tour's copy as the one nobody updates. So
   * which steps need prose here is a fact about the step list, not about the
   * type, and `registry.test.ts` is where it is enforced: every step without a
   * `guideType` must have English copy, and no copy may name a step that has
   * one.
   */
  tour: Partial<Record<TourStepId, TourCopy>>
}

/** What a locale that is still filling in may provide. */
export type PartialContent = {
  articles?: Partial<Record<ArticleId, Article>>
  tour?: Partial<Record<TourStepId, TourCopy>>
}

/**
 * The per-locale chunks, by path.
 *
 * `import.meta.glob` rather than a map of dynamic imports written by hand: the
 * bundler needs a literal pattern to find and split these, and a hand-written
 * map is one more place a new locale has to be remembered.
 *
 * English is imported statically instead, because it is the fallback — every
 * lookup needs it, so deferring it would only buy a second round trip. It is
 * excluded from the pattern rather than merely unused: a module both statically
 * and dynamically imported cannot be split out, so leaving it in would produce
 * a chunk entry that can never be a chunk, and a build warning saying exactly
 * that.
 */
const CHUNKS = import.meta.glob<{ default: PartialContent }>([
  './content/*.ts',
  '!./content/en.ts',
])

export interface LoadedContent {
  content: Content
  /**
   * Which articles this locale actually carries.
   *
   * Reported per article rather than per locale so the sheet can be honest
   * about one piece without disowning the rest: a German reader looking at a
   * translated article should not be told the library is provisional, and one
   * looking at an untranslated article should not be left to infer it from the
   * language changing under them.
   */
  translated: ReadonlySet<ArticleId>
}

const ALL_ARTICLES: ReadonlySet<ArticleId> = new Set(Object.keys(en.articles) as ArticleId[])

/**
 * A locale's content, with English behind it.
 *
 * Merged per article rather than per locale: a language that has translated two
 * of eight articles should show those two in the language and the rest in
 * English, not all eight in English until the set is finished. That is what
 * lets the library grow one article at a time in five languages.
 */
export async function loadContent(locale: Locale): Promise<LoadedContent> {
  if (locale === 'en') return { content: en, translated: ALL_ARTICLES }

  const chunk = CHUNKS[`./content/${locale}.ts`]
  if (!chunk) return { content: en, translated: new Set() }

  let loaded: PartialContent
  try {
    loaded = (await chunk()).default
  } catch {
    // A chunk that will not load is a deploy problem, not a reason to show the
    // user an empty library. English is already in hand.
    return { content: en, translated: new Set() }
  }

  return {
    content: {
      articles: { ...en.articles, ...loaded.articles },
      tour: { ...en.tour, ...loaded.tour },
    },
    translated: new Set(Object.keys(loaded.articles ?? {}) as ArticleId[]),
  }
}
