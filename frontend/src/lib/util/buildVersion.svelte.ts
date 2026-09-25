/**
 * Stale-client detection.
 *
 * The SPA ships as content-hashed chunks inside a Docker image that replaces `dist`
 * wholesale on every deploy. A tab left open across a deploy is therefore running code
 * whose chunks are gone from the server: lazy `import()` calls 404, and the tab is also
 * holding API expectations and a vault from the previous build.
 *
 * Every build stamps the same id into the bundle (`__BUILD_ID__`, via `define`) and into
 * `dist/version.json`. Fetching that file and comparing tells this tab whether it is
 * still the live build. No backend involvement — nginx serves the frontend's own files,
 * so the app asks its own origin.
 */

const VERSION_URL = '/version.json'

/** Ten minutes. A stale tab is a nuisance, not an emergency; polling harder buys nothing. */
const CHECK_INTERVAL_MS = 10 * 60 * 1000

/**
 * Build id compiled into this bundle. Empty only if the `define` was somehow absent,
 * in which case there is nothing meaningful to compare and the check stays inert.
 */
export const BUILD_ID: string = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : ''

/** Latest id seen from the server. `null` until a check succeeds. */
let latestBuildId = $state<string | null>(null)

/** The id the user dismissed the banner for, so a *newer* build shows it again. */
let dismissedBuildId = $state<string | null>(null)

function stale(): boolean {
  return latestBuildId !== null && latestBuildId !== BUILD_ID
}

export function getBuildVersionState() {
  return {
    get currentBuildId() { return BUILD_ID },
    get latestBuildId() { return latestBuildId },
    /** The server is serving a build other than the one this tab is running. */
    get stale() { return stale() },
    /** Stale, and the user has not dismissed the notice for this particular build. */
    get showBanner() { return stale() && latestBuildId !== dismissedBuildId },
  }
}

/**
 * Hide the notice for the currently detected build.
 *
 * Deliberately not persisted: a reload, a new tab, or a further deploy all bring it
 * back. Dismissing silences one build, never the mechanism.
 */
export function dismissUpdate(): void {
  dismissedBuildId = latestBuildId
}

/**
 * Fetch the live build id and record it.
 *
 * Any failure — offline, a dev server with no `dist/version.json`, nginx's SPA fallback
 * handing back index.html instead of JSON — is swallowed and leaves state untouched.
 * Being unable to reach the server is not evidence of being stale.
 */
export async function checkBuildVersion(): Promise<void> {
  if (!BUILD_ID) return

  try {
    // `no-store` plus a cache-busting param: nginx may still be setting cache headers
    // on this file, and a cached answer is exactly the wrong answer here.
    const res = await fetch(`${VERSION_URL}?t=${Date.now()}`, { cache: 'no-store' })
    if (!res.ok) return

    const body = await res.json()
    if (body && typeof body.buildId === 'string' && body.buildId) {
      latestBuildId = body.buildId
    }
  } catch {
    // Ignored on purpose. See the doc comment above.
  }
}

/**
 * Begin watching for new builds. Returns a teardown function.
 *
 * Checks immediately, then on an interval, and whenever the tab becomes visible —
 * the common case being a tab left open overnight and returned to after a deploy.
 */
export function startBuildVersionWatch(): () => void {
  void checkBuildVersion()

  const timer = setInterval(() => { void checkBuildVersion() }, CHECK_INTERVAL_MS)

  const onVisibilityChange = () => {
    if (document.visibilityState === 'visible') void checkBuildVersion()
  }
  document.addEventListener('visibilitychange', onVisibilityChange)

  return () => {
    clearInterval(timer)
    document.removeEventListener('visibilitychange', onVisibilityChange)
  }
}

/**
 * True if `e` looks like a dynamic `import()` whose chunk could not be loaded.
 *
 * Browsers disagree on both wording and error type, so this matches distinctive
 * substrings rather than any single exact string:
 *   Chrome   TypeError "Failed to fetch dynamically imported module: <url>"
 *   Firefox  TypeError "error loading dynamically imported module: <url>"
 *   Safari   TypeError "Importing a module script failed."
 * A deploy can also leave the hashed URL resolving to nginx's index.html fallback,
 * which surfaces as "Expected a JavaScript module script but the server responded
 * with a MIME type of text/html" — also caught by the "module script" arm.
 */
export function isModuleLoadError(e: unknown): boolean {
  const text = (e instanceof Error ? e.message : String(e ?? '')).toLowerCase()
  return text.includes('dynamically imported module') || text.includes('module script')
}

/** User-facing copy for a chunk that vanished under a running tab. */
export const MODULE_LOAD_ERROR_MESSAGE =
  'The app was updated in the background and this part could no longer be loaded. Please reload the page and try again.'

/** Test seam: clears detection state between cases. Not used by the app. */
export function resetBuildVersionState(): void {
  latestBuildId = null
  dismissedBuildId = null
}
