import type { IllustrationName } from './Illustration.svelte'

/**
 * The library's table of contents, as data.
 *
 * Structure here, words elsewhere. A row says an article exists, which section
 * it belongs to and which drawing goes with it; what it actually *says* lives
 * in `content/<locale>.ts`, so adding a language is a file rather than an edit
 * to every entry. `typeGuide.ts` already makes the same split with slugs, for
 * the same reason.
 *
 * Adding an article is a row here, an entry in `content/en.ts`, and nothing
 * else. `registry.test.ts` holds the two halves to each other.
 */
export type ArticleId =
  // --- About this app ---
  | 'about-budget'
  // --- Swiss basics ---
  | 'pillar-3a'

/**
 * Which part of the Knowledge screen an article appears under.
 *
 * `about` explains this app; `swiss` explains the country the app is for.
 * Keeping them apart matters more than it looks: the first is ours to change
 * whenever we change the app, and the second is not ours at all — it describes
 * rules set by the Confederation and the cantons, and every article in it
 * carries a link to whoever actually sets them.
 */
export type ArticleSection = 'about' | 'swiss'

export interface ArticleMeta {
  id: ArticleId
  section: ArticleSection
  illustration: IllustrationName
}

/**
 * Article order within a section is the order here — deliberate, not
 * alphabetical, so a section can open with the piece that makes the rest
 * readable.
 */
export const ARTICLES: ArticleMeta[] = [
  { id: 'about-budget', section: 'about', illustration: 'budget' },
  { id: 'pillar-3a', section: 'swiss', illustration: 'pillars' },
]

/*
 * Intended next, in roughly this order. Listed rather than written, because a
 * half-researched tidbit about Swiss money is worse than no tidbit at all:
 *
 *   about-accounts     what the accounts view is for, and what allocations add
 *   about-privacy      the vault — why the server cannot read any of this
 *   franchise          the deductible, 300–2500, and priminfo.ch as the one
 *                      official premium calculator
 *   premium-reduction  that cantonal premium subsidies exist and are applied for
 *   tax-is-a-bill      why a Swiss tax invoice is the textbook worked example of
 *                      a `bill` entry, and why estimating it here would be wrong
 *   qr-bill            what replaced the payment slip, and what the QR code holds
 *   three-pillars      AHV, occupational, private — the frame 3a sits inside
 */

export function articlesIn(section: ArticleSection): ArticleMeta[] {
  return ARTICLES.filter(a => a.section === section)
}
