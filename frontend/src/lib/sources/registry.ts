import type { PartialContent } from '../knowledge/content'
import { UPKEEP } from '../upkeep/register'

/**
 * Every page outside the app that the app sends somebody to.
 *
 * **Collected, not written.** The links already live as data where they are
 * used — an article's sources and a tour step's links in
 * `knowledge/content/<locale>.ts`, a seeded figure's publisher in
 * `upkeep/register.ts` — and a second list beside them would be one more copy
 * of each URL to forget when it changes. This gathers them instead, so that a
 * link added in any of those places is checked without anybody remembering to
 * enrol it.
 *
 * What keeps that true is `registry.test.ts`, which reads every source file for
 * an `https://` and fails on one this does not know about. A link written
 * straight into a component would otherwise be invisible to the check that
 * exists to catch it going dead.
 *
 * Imported by tests and the link check only. Nothing in the app reads it, so
 * the eager glob below never reaches a bundle.
 */
export interface ExternalSource {
  url: string
  label: string
  /** Where it is used, for the message that says it has gone. */
  usedBy: string[]
}

const CONTENT = import.meta.glob<{ default: PartialContent }>('../knowledge/content/*.ts', { eager: true })

export function externalSources(): ExternalSource[] {
  const byUrl = new Map<string, ExternalSource>()
  const add = (url: string, label: string, usedBy: string) => {
    const known = byUrl.get(url)
    if (known) known.usedBy.push(usedBy)
    else byUrl.set(url, { url, label, usedBy: [usedBy] })
  }

  for (const [path, module] of Object.entries(CONTENT)) {
    const locale = path.replace(/^.*\/(\w+)\.ts$/, '$1')
    const { articles = {}, tour = {} } = module.default
    for (const [id, article] of Object.entries(articles)) {
      for (const s of article?.sources ?? []) add(s.url, s.label, `article ${id} (${locale})`)
    }
    for (const [id, step] of Object.entries(tour)) {
      for (const l of step?.links ?? []) add(l.url, l.label, `tour step ${id} (${locale})`)
    }
  }

  for (const entry of UPKEEP) add(entry.source.url, entry.source.label, `upkeep ${entry.id}`)

  return [...byUrl.values()]
}
