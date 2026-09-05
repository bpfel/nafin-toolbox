import { render, screen, cleanup, waitFor } from '@testing-library/svelte'
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * The address bar reaching a screen, rather than a button doing it.
 *
 * The unit tests beside the router prove it parses and listens; this proves App
 * is wired to it — that a path typed into the bar picks the screen, that the
 * back button leaves it, and that an address anyone can type does not hand out
 * a screen the button for it would have hidden.
 */

let currentUser: { id: number; email: string; role: string; must_change_password: boolean } | null =
  null

vi.mock('./lib/api/client', () => ({
  fetchModules: vi.fn(async () => []),
  enableModule: vi.fn(),
  disableModule: vi.fn(),
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

describe('the address bar picks the screen', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/')
  })

  afterEach(() => {
    cleanup()
    window.history.replaceState({}, '', '/')
    currentUser = null
  })

  test('an admin landing on /users gets user management', async () => {
    currentUser = admin
    window.history.replaceState({}, '', '/users')

    render(App)

    expect(await screen.findByText('User Management')).toBeTruthy()
  })

  test('a user landing on /users does not', async () => {
    // The button that leads there only shows for an admin, but a path can be
    // typed. Routing turns a hidden control into a reachable address, and this
    // is the guard that closed the difference.
    currentUser = user
    window.history.replaceState({}, '', '/users')

    render(App)

    await waitFor(() => expect(screen.queryByText('No modules enabled yet.')).toBeTruthy())
    expect(screen.queryByText('User Management')).toBeNull()
  })

  test('the back button leaves the screen again', async () => {
    currentUser = admin
    window.history.replaceState({}, '', '/users')

    render(App)
    expect(await screen.findByText('User Management')).toBeTruthy()

    // Standing in for the browser: jsdom fires popstate on its own schedule,
    // and what matters here is that App re-reads the address bar when told to.
    window.history.replaceState({}, '', '/')
    window.dispatchEvent(new PopStateEvent('popstate'))

    await waitFor(() => expect(screen.queryByText('User Management')).toBeNull())
  })
})
