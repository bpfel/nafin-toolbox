import { render, screen, cleanup, waitFor } from '@testing-library/svelte'
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * The shell: the address bar reaching a screen, and the bar offering the places
 * that role actually has.
 *
 * The unit tests beside the router prove it parses and listens. These prove App
 * is wired to it — that a typed path picks a screen, that an address belonging
 * to another role does not hand out its screen, and that the two destination
 * lists are genuinely different rather than one list with things hidden.
 */

let currentUser: { id: number; email: string; role: string; must_change_password: boolean } | null =
  null

vi.mock('./lib/api/client', () => ({
  setOnUnauthorized: vi.fn(),
}))

vi.mock('./lib/auth/authStore.svelte', () => ({
  checkAuth: vi.fn(),
  logout: vi.fn(),
  getSettings: vi.fn(async () => ({ require_2fa: false })),
  clearRecoveryKey: vi.fn(),
  completeVaultSetup: vi.fn(),
  recoverAccount: vi.fn(),
  unlockVault: vi.fn(),
  // Reached only once the invite panel mounts.
  inviteUser: vi.fn(),
  listUsers: vi.fn(async () => []),
  // And this one only once the audit screen does. A factory mock replaces the
  // whole module, so anything the mounted tree reaches for and this list omits
  // is `undefined` — which Vitest turns into a throw from inside an effect,
  // where no `await` in a test can catch it. It surfaces as an unhandled error
  // that leaves every assertion passing and the run exiting non-zero.
  fetchAuditLogs: vi.fn(async () => ({ entries: [], total: 0 })),
  deleteUser: vi.fn(),
  resendVerification: vi.fn(),
  adminResetPassword: vi.fn(),
  getAuthState: () => ({
    get currentUser() {
      return currentUser
    },
    loading: false,
    needsSetup: false,
    vaultNeedsSetup: false,
    vaultLocked: false,
    vaultDecryptFailed: false,
    recoveryKeyToShow: null,
  }),
}))

vi.mock('./lib/crypto/vaultStore.svelte', () => ({
  sessionEndedElsewhere: vi.fn(),
  getVaultState: () => ({
    unlocked: true,
    vault: null,
    dirty: false,
    saving: false,
    conflicted: false,
    lastSaved: null,
    versionAhead: false,
    // Somebody who has never started a household. The switch draws nothing in
    // that state, which is what every assertion below about the shell assumes.
    identity: null,
    households: [],
    currentVaultId: 'personal',
    currentHousehold: null,
  }),
  switchTo: vi.fn(),
  createHousehold: vi.fn(),
  renameHousehold: vi.fn(),
  deleteHousehold: vi.fn(),
  // Belege is mounted with the shell, and closes finished months on the way in.
  closeEndedMonths: vi.fn(),
  listMembers: vi.fn(async () => []),
  commit: vi.fn(),
  saveNow: vi.fn(),
  belegUnsaved: () => false,
}))

vi.mock('./lib/util/buildVersion.svelte', () => ({
  startBuildVersionWatch: () => () => {},
  getBuildVersionState: () => ({ updateAvailable: false, dismissed: false, moduleLoadFailed: false }),
  dismissUpdate: vi.fn(),
  isModuleLoadError: () => false,
  MODULE_LOAD_ERROR_MESSAGE: '',
}))

import App from './App.svelte'
import { navigate, syncFromLocation } from './lib/nav/router.svelte'
import { isEditing, toggleEditing, clearEditing } from './lib/util/editMode.svelte'

const admin = { id: 1, email: 'admin@example.ch', role: 'admin', must_change_password: false }
const user = { id: 2, email: 'anna@example.ch', role: 'user', must_change_password: false }

/**
 * Puts the address bar *and* the router at `path`.
 *
 * `replaceState` alone was not enough. The router reads the address once, on
 * mount, so a path set before render was only honoured if the shell did not
 * redirect first — and it redirects anything that is not the role's landing
 * screen. Every test in this file happened to name a landing screen, so they
 * all passed either way and none of them proved what it looked like it
 * proved.
 *
 * `syncFromLocation` is the seam the router already exposes for this, for the
 * verification page, which rewrites the address itself.
 */
function at(path: string) {
  window.history.replaceState({}, '', path)
  syncFromLocation()
}

describe('the shell', () => {
  beforeEach(() => at('/'))

  afterEach(() => {
    cleanup()
    at('/')
    currentUser = null
  })

  test('a user starts on the budget', async () => {
    // `/` names no screen. The router cannot resolve it, because an admin starts
    // somewhere a user does not; the shell can.
    currentUser = user
    render(App)

    await waitFor(() => expect(window.location.pathname).toBe('/budget'))
  })

  test('an admin starts on user management', async () => {
    currentUser = admin
    render(App)

    await waitFor(() => expect(window.location.pathname).toBe('/users'))
    expect(await screen.findByText('User Management')).toBeTruthy()
  })

  test('the bar offers a user their own places, and only those', async () => {
    currentUser = user
    render(App)

    const nav = await screen.findByRole('navigation', { name: 'Sections' })
    const labels = [...nav.querySelectorAll('a')].map((a) => a.textContent?.trim())
    expect(labels).toEqual(['Budget', 'Spending', 'Accounts', 'Knowledge', 'Profile'])
  })

  /**
   * Five, and the reason it is worth asserting the count rather than only the
   * contents: the bar is drawn against a 320px screen. The fifth, Belege, was a
   * decision, checked at 320px in every language; a sixth has to be one too,
   * not something that arrives with a feature.
   */
  test('a user has five places, which is what the bar was checked for', async () => {
    currentUser = user
    render(App)

    const nav = await screen.findByRole('navigation', { name: 'Sections' })
    expect(nav.querySelectorAll('a').length).toBe(5)
  })

  /**
   * The build id used to sit under every screen. It is on one page now, which
   * only works if it is actually on that page — and the test that would have
   * caught its absence is this one, not the component's own.
   */
  test('the build is named on the profile page', async () => {
    currentUser = admin
    at('/profile')
    const { container } = render(App)

    await waitFor(() => expect(container.textContent).toContain('nafin'))
  })

  test('and nowhere else', async () => {
    currentUser = admin
    at('/users')
    const { container } = render(App)

    await waitFor(() => expect(screen.queryByText('User Management')).toBeTruthy())
    expect(container.textContent).not.toContain('nafin')
  })

  test('an admin is offered no library, having no vault to explain', async () => {
    currentUser = admin
    at('/knowledge')
    render(App)

    await waitFor(() => expect(window.location.pathname).toBe('/users'))
  })

  test('and an admin a different set, not a shortened one', async () => {
    currentUser = admin
    render(App)

    const nav = await screen.findByRole('navigation', { name: 'Sections' })
    const labels = [...nav.querySelectorAll('a')].map((a) => a.textContent?.trim())
    expect(labels).toEqual(['Users', 'Audit', 'Upkeep', 'Profile'])
  })

  /**
   * The admin list took the fourth slot Upkeep needed, and it was the list that
   * had one free. Asserting the count here for the same reason it is asserted
   * for a user: both bars are now full, and the next destination in either is a
   * decision rather than an addition.
   */
  test('an admin also has four, which fills the bar', async () => {
    currentUser = admin
    render(App)

    const nav = await screen.findByRole('navigation', { name: 'Sections' })
    expect(nav.querySelectorAll('a').length).toBe(4)
  })

  test('an admin can open the register of dated figures', async () => {
    currentUser = admin
    at('/upkeep')
    const { container } = render(App)

    await waitFor(() => expect(window.location.pathname).toBe('/upkeep'))
    expect(container.textContent).toContain('Serafe')
  })

  /**
   * A user has nothing to do here — they cannot edit a seed or cut a release —
   * and the screen carries a button that makes the server send mail. The bar
   * never points them at it; the address bar would, if the guard let it.
   */
  test('a user typing the register\u2019s address is sent back to their own', async () => {
    currentUser = user
    at('/upkeep')

    render(App)

    await waitFor(() => expect(window.location.pathname).toBe('/budget'))
    expect(screen.queryByText('Upkeep')).toBeNull()
  })

  test('a typed address belonging to the other role does not open it', async () => {
    // The bar never points a user here, but a path can be typed. Routing turned
    // a control nobody could see into an address anybody can reach.
    currentUser = user
    at('/users')

    render(App)

    await waitFor(() => expect(window.location.pathname).toBe('/budget'))
    expect(screen.queryByText('User Management')).toBeNull()
  })

  /**
   * An invitation link has no button pointing at it anywhere, which is exactly
   * why it was broken: the shell replaces any screen that is not a navigation
   * destination, so every invitation link in existence quietly opened the
   * budget instead. Arriving somewhere is not the same as navigating to it.
   */
  test('an invitation link opens the join screen rather than the budget', async () => {
    currentUser = user
    at('/join')

    render(App)

    // The point is the absence of a redirect: it stays where it was sent.
    await waitFor(() => expect(window.location.pathname).toBe('/join'))
  })

  // An administrator has no vault, so no keypair, so nothing an invitation
  // could ever be wrapped to. Their own landing screen beats one that could
  // only fail.
  test('but an administrator following one lands on their own screen', async () => {
    currentUser = admin
    at('/join')

    render(App)

    await waitFor(() => expect(window.location.pathname).toBe('/users'))
  })

  test('an unrecognised address lands on the same place as /', async () => {
    currentUser = user
    at('/budgt')

    render(App)

    await waitFor(() => expect(window.location.pathname).toBe('/budget'))
  })

  test('the back button leaves a screen again', async () => {
    currentUser = admin
    at('/users')
    render(App)
    expect(await screen.findByText('User Management')).toBeTruthy()

    // Standing in for the browser: jsdom fires popstate on its own schedule, and
    // what needs proving is that the shell re-reads the address bar when told.
    at('/audit')
    window.dispatchEvent(new PopStateEvent('popstate'))

    await waitFor(() => expect(screen.queryByText('User Management')).toBeNull())
  })
})

/**
 * Edit mode is an unlock, not work in progress.
 *
 * The two money screens stay mounted behind `hidden` so a half-typed amount
 * survives a tab switch — which meant an armed delete button survived it too,
 * and was still armed on a later visit the user had no reason to connect to the
 * one where they pressed Edit.
 */
describe('edit mode across a change of screen', () => {
  beforeEach(() => at('/'))

  afterEach(() => {
    cleanup()
    at('/')
    currentUser = null
    clearEditing()
  })

  test('leaving a screen puts it back into read-only', async () => {
    currentUser = user
    at('/budget')
    render(App)
    await waitFor(() => expect(window.location.pathname).toBe('/budget'))

    toggleEditing('budget')
    expect(isEditing('budget')).toBe(true)

    navigate('/accounts')

    await waitFor(() => expect(isEditing('budget')).toBe(false))
  })

  test('a sub-tab is the same screen, so edit mode survives it', async () => {
    // Both tabs share the `accounts` key, so treating `/accounts` →
    // `/accounts/allocations` as leaving would switch the screen off underneath
    // someone who is still standing on it.
    currentUser = user
    at('/accounts')
    render(App)
    await waitFor(() => expect(window.location.pathname).toBe('/accounts'))

    toggleEditing('accounts')

    navigate('/accounts/allocations')
    await waitFor(() => expect(window.location.pathname).toBe('/accounts/allocations'))

    expect(isEditing('accounts')).toBe(true)
  })
})
