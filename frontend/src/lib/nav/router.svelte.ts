// Where in the app the address bar says we are.
//
// Hand-written rather than a library, for three reasons that are specific to
// this app rather than general preference:
//
// 1. The whole app sits behind a chain of gates — signing in, unlocking the
//    vault, an enforced 2FA setup. A router's normal job is to decide what
//    renders; here it must *not*. `gate.ts` decides that, and the route only
//    says where the user goes once they are through. Every router worth using
//    would have to be argued out of its own guard machinery to get that.
//
// 2. Two levels, hard stop: a screen and a sub-tab. Anything deeper is a modal
//    or a disclosure. That rule keeps `parse` to a lookup and keeps the back
//    button meaning exactly one thing.
//
// 3. There was already a hand-rolled route here — `window.location.pathname
//    === '/verify'`, read once at start-up and tracked by hand thereafter. This
//    does not introduce the pattern, it takes over the one already running.
//
// nginx has served `try_files $uri $uri/ /index.html` since the beginning, so
// deep links have worked in production all along; nothing was reading them.

/** Every screen the address bar can name. */
export type Screen = 'home' | 'security' | 'users' | 'verify'

const SCREENS: Record<string, Screen> = {
  '/': 'home',
  '/security': 'security',
  '/users': 'users',
  '/verify': 'verify',
}

/**
 * An unrecognised path renders home rather than a not-found screen, and the
 * address bar is left showing whatever was typed.
 *
 * Rewriting it to `/` would be tidier to look at and worse to debug: a
 * mistyped link would correct itself silently, and the one person who could
 * tell you the link is wrong — whoever followed it — would never find out.
 */
function parse(pathname: string): Screen {
  const trimmed = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  return SCREENS[trimmed || '/'] ?? 'home'
}

/** Strips any query or hash, so state holds a path and nothing else. */
function pathOf(url: string): string {
  return new URL(url, window.location.origin).pathname
}

let pathname = $state(window.location.pathname)

export function getRoute() {
  return {
    get screen(): Screen {
      return parse(pathname)
    },
    /** The raw path, for the rare caller that needs more than the screen. */
    get pathname(): string {
      return pathname
    },
  }
}

/** Goes somewhere, leaving the current screen in the back button's history. */
export function navigate(to: string): void {
  const path = pathOf(to)
  if (path === pathname && to === path) return
  window.history.pushState({}, '', to)
  pathname = path
}

/**
 * Goes somewhere without leaving a step behind, for a screen the user should
 * not be able to come back to — a spent verification link, most of all.
 */
export function replace(to: string): void {
  window.history.replaceState({}, '', to)
  pathname = pathOf(to)
}

/**
 * Catches up with an address bar something else changed.
 *
 * `VerifyEmailPage` calls `history.replaceState` itself as it finishes, and
 * neither pushState nor replaceState fires an event — the only way to hear
 * about them is to be the one who called them. Rather than have that component
 * import the router, it keeps doing what it does and says so afterwards.
 */
export function syncFromLocation(): void {
  pathname = window.location.pathname
}

/**
 * Starts listening for the back and forward buttons. Returns the teardown, so
 * it can be handed straight to an `$effect` the way the build-version watch is.
 */
export function startRouting(): () => void {
  syncFromLocation()
  const onPopState = () => syncFromLocation()
  window.addEventListener('popstate', onPopState)
  return () => window.removeEventListener('popstate', onPopState)
}
