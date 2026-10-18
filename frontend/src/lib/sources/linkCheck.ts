/**
 * What a fetched link's answer means. Kept apart from `sources.links.ts` so it
 * can be tested without the network.
 *
 * Three outcomes, not two:
 *
 * - **gone** — 404, 410, any other non-2xx that is not a refusal, or a
 *   redirect to the publisher's front page, which is how most of them say
 *   "this page was removed" without saying 404.
 * - **blocked** — 401, 403, 429. Some sites (sbb.ch) turn away anything that
 *   is not a browser. That says nothing about whether the page exists, so it
 *   is reported and never fails the check: a check that cries wolf every week
 *   is a check nobody reads.
 * - **there** — a 2xx that stayed on the page asked for, or one like it.
 */
export type LinkVerdict = 'there' | 'gone' | 'blocked'

const BLOCKED = new Set([401, 403, 429])

export function verdict(status: number, asked: string, landed: string): LinkVerdict {
  if (BLOCKED.has(status)) return 'blocked'
  if (status < 200 || status >= 300) return 'gone'
  return landedOnFrontPage(asked, landed) ? 'gone' : 'there'
}

/**
 * A page that redirects to the root of its own site has, in practice, been
 * removed. A locale root counts as the root — `/de/` is where admin.ch sends
 * you.
 */
export function landedOnFrontPage(asked: string, landed: string): boolean {
  const isRoot = (p: string) => /^\/([a-z]{2}(-[a-z]{2})?\/?)?$/i.test(p)
  return !isRoot(new URL(asked).pathname) && isRoot(new URL(landed).pathname)
}
