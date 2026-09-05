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
  getVaultState: () => ({
    unlocked: true,
    vault: null,
    dirty: false,
    saving: false,
    conflicted: false,
    lastSaved: null,
    versionAhead: false,
  }),
  markDirty: vi.fn(),
}))

vi.mock('./lib/util/buildVersion.svelte', () => ({
  startBuildVersionWatch: () => () => {},
  getBuildVersionState: () => ({ updateAvailable: false, dismissed: false, moduleLoadFailed: false }),
  dismissUpdate: vi.fn(),
  isModuleLoadError: () => false,
  MODULE_LOAD_ERROR_MESSAGE: '',
}))

import App from './App.svelte'

const admin = { id: 1, email: 'admin@example.ch', role: 'admin', must_change_password: false }
const user = { id: 2, email: 'anna@example.ch', role: 'user', must_change_password: false }

function at(path: string) {
  window.history.replaceState({}, '', path)
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
    expect(labels).toEqual(['Budget', 'Accounts', 'Profile'])
  })

  test('and an admin a different set, not a shortened one', async () => {
    currentUser = admin
    render(App)

    const nav = await screen.findByRole('navigation', { name: 'Sections' })
    const labels = [...nav.querySelectorAll('a')].map((a) => a.textContent?.trim())
    expect(labels).toEqual(['Users', 'Audit', 'Profile'])
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
