/**
 * Noticing that this tab's session has ended elsewhere.
 *
 * "Log out everywhere", a password change and an admin's reset all end sessions
 * on the server, but a tab only finds out at its next request. Until then it
 * keeps showing the decrypted vault — on the lost phone that "everywhere" was
 * meant for, for as long as nobody touches it. So an open tab asks.
 *
 * It asks when it comes back into view or gets focus, which is when somebody is
 * about to look at it, and every half minute while visible, for a tab left open
 * on a screen. A hidden tab does not ask: it will when it is shown again.
 *
 * Asking does not keep the session alive — sessions do not slide, so this
 * cannot stretch one past its expiry. Only a 401 counts as ended; being offline
 * or a server error is not evidence of anything.
 */

const CHECK_INTERVAL_MS = 30 * 1000

export async function sessionStillValid(): Promise<boolean> {
  try {
    const res = await fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' })
    return res.status !== 401
  } catch {
    return true
  }
}

/** Begin watching. Calls `onEnded` once if the session is gone; returns a teardown. */
export function startSessionWatch(onEnded: () => void): () => void {
  let stopped = false

  const check = async () => {
    if (stopped || document.visibilityState !== 'visible') return
    if (!(await sessionStillValid()) && !stopped) {
      stop()
      onEnded()
    }
  }

  const timer = setInterval(() => { void check() }, CHECK_INTERVAL_MS)
  const onVisibilityChange = () => { void check() }
  const onFocus = () => { void check() }
  document.addEventListener('visibilitychange', onVisibilityChange)
  window.addEventListener('focus', onFocus)

  function stop() {
    stopped = true
    clearInterval(timer)
    document.removeEventListener('visibilitychange', onVisibilityChange)
    window.removeEventListener('focus', onFocus)
  }

  return stop
}
