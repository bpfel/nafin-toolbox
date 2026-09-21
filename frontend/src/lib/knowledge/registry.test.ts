import { describe, test, expect } from 'vitest'
import { ARTICLES, articlesIn, type ArticleId } from './registry'
import { en } from './content/en'

/**
 * Holds the two halves of the library to each other, and holds the Swiss half
 * to its sources.
 *
 * The registry says an article exists and the content module says what it
 * says. Nothing in the type system connects a row to its prose — `ArticleId`
 * is satisfied by both files independently — so a row added without prose
 * renders `undefined` in a list, and prose added without a row is invisible.
 * Both have to be caught here or not at all.
 */
describe('the article registry and its content agree', () => {
  test('every registered article has English prose', () => {
    const missing = ARTICLES.filter(a => en.articles[a.id] === undefined).map(a => a.id)
    expect(missing).toEqual([])
  })

  test('every English article is registered', () => {
    const registered = new Set(ARTICLES.map(a => a.id))
    const orphans = (Object.keys(en.articles) as ArticleId[]).filter(id => !registered.has(id))
    expect(orphans).toEqual([])
  })

  test('article ids are unique', () => {
    const ids = ARTICLES.map(a => a.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  test('every article belongs to a section that is rendered', () => {
    // The screen renders `about` and `swiss`. A third section value would type
    // fine and silently never appear.
    const shown = [...articlesIn('about'), ...articlesIn('swiss')]
    expect(shown.length).toBe(ARTICLES.length)
  })

  test('no article is empty', () => {
    for (const { id } of ARTICLES) {
      const article = en.articles[id]
      expect(article.title.length, id).toBeGreaterThan(0)
      expect(article.body.length, id).toBeGreaterThan(0)
    }
  })
})

/**
 * The rule that makes a library about Swiss money safe to publish.
 *
 * Every figure worth quoting — the 3a cap, a franchise, a tax rate — varies by
 * year, canton or personal situation, so the library links to whoever sets it
 * rather than repeating it. That is only worth anything if the link goes
 * somewhere official: a tidbit citing a bank's marketing page carries the
 * app's authority to a source that has something to sell.
 *
 * `admin.ch` subdomains cover the federal offices (ESTV, BAG, BSV). `ch.ch` is
 * the Confederation's own portal. `paymentstandards.ch` is the QR-bill
 * standard, published by SIX under a mandate — the only non-federal entry, and
 * it is here because there is no federal publisher of that standard.
 */
const OFFICIAL_HOSTS = [/(^|\.)admin\.ch$/, /(^|\.)ch\.ch$/, /(^|\.)paymentstandards\.ch$/]

describe('sources point at official Swiss publishers', () => {
  const sources = ARTICLES.flatMap(({ id }) =>
    (en.articles[id].sources ?? []).map(source => ({ id, ...source })),
  )

  test('there is at least one source to check', () => {
    // Guards the two tests below from passing vacuously if the Swiss section
    // is ever emptied — which would make this whole file green and useless.
    expect(sources.length).toBeGreaterThan(0)
  })

  test.each(sources)('$id → $url is https and official', ({ url }) => {
    const parsed = new URL(url)
    expect(parsed.protocol).toBe('https:')
    expect(OFFICIAL_HOSTS.some(rx => rx.test(parsed.hostname))).toBe(true)
  })

  test('every source is labelled', () => {
    for (const source of sources) {
      expect(source.label.trim().length, source.url).toBeGreaterThan(0)
    }
  })
})

/**
 * No Swiss franc figure is written into the prose.
 *
 * This is the rule `CLAUDE.md` states as "do not invent Swiss facts", enforced
 * rather than remembered. A cap written into an article is correct until the
 * January after it is written, and then it is a number a user trusted.
 *
 * Deliberately narrow: it looks for an amount, not for every digit. A year, a
 * pillar number and a franchise *range* described in words are all fine — what
 * is not fine is this file claiming to know what a figure currently is.
 */
describe('no figure is baked into the prose', () => {
  const AMOUNT = /\b(?:CHF|Fr\.?)\s?\d|\d[\d'’,.]*\s?(?:CHF|Fr\.|francs?|Franken)\b/i

  test.each(ARTICLES)('$id quotes no amount', ({ id }) => {
    for (const paragraph of en.articles[id].body) {
      expect(AMOUNT.test(paragraph), paragraph).toBe(false)
    }
  })
})
