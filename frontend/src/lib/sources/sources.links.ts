import { describe, test } from 'vitest'
import { externalSources } from './registry'
import { verdict } from './linkCheck'

/**
 * Whether every page the app links to is still there.
 *
 * Networked, so not part of `npm test`: a publisher's bad afternoon must not
 * turn somebody's pull request red. Run with `npm run links`, on a schedule by
 * `.github/workflows/links.yml`, and on pull requests that touch a link.
 *
 * What counts as gone, blocked or there is `linkCheck.ts`.
 */

const TIMEOUT_MS = 20_000
// Some publishers serve a stripped page or a refusal to an unknown agent.
const USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64) nafin-toolbox link check'

async function fetchOnce(url: string): Promise<Response> {
  return fetch(url, {
    redirect: 'follow',
    headers: { 'user-agent': USER_AGENT, accept: 'text/html' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
}

/** One retry, for a timeout or a 5xx — the two that are often only momentary. */
async function fetchWithRetry(url: string): Promise<Response> {
  try {
    const res = await fetchOnce(url)
    if (res.status < 500) return res
  } catch {
    // Fall through to the second attempt.
  }
  await new Promise(r => setTimeout(r, 3_000))
  return fetchOnce(url)
}

describe('every linked page still exists', () => {
  test.concurrent.each(externalSources())('$url', async ({ url, usedBy }) => {
    const where = `used by ${usedBy.join(', ')}`
    let res: Response
    try {
      res = await fetchWithRetry(url)
    } catch (e) {
      throw new Error(`${url} did not answer (${(e as Error).message}); ${where}`)
    }
    // Read and dropped, so the connection is released.
    await res.arrayBuffer().catch(() => undefined)

    switch (verdict(res.status, url, res.url)) {
      case 'blocked':
        console.log(`::warning title=Link not checkable::${url} answered ${res.status} to a script; check it in a browser. ${where}`)
        return
      case 'gone':
        throw new Error(`${url} answered ${res.status} at ${res.url}; ${where}`)
    }
  })
})
