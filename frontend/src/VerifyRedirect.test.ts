import { render, screen, cleanup, waitFor } from '@testing-library/svelte'
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'

let currentUser: { id: number; email: string; role: string; must_change_password: boolean } | null = null

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
  inviteUser: vi.fn(),
  listUsers: vi.fn(async () => []),
  deleteUser: vi.fn(),
  resendVerification: vi.fn(),
  adminResetPassword: vi.fn(),
  getAuthState: () => ({
    get currentUser() { return currentUser },
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
  getVaultState: () => ({ unlocked: true, vault: null, dirty: false, saving: false, conflicted: false, lastSaved: null, versionAhead: false }),
}))

// UpdateBanner reads this; the watcher is stubbed so no timer or fetch runs.
vi.mock('./lib/util/buildVersion.svelte', () => ({
  startBuildVersionWatch: () => () => {},
  getBuildVersionState: () => ({ updateAvailable: false, dismissed: false, moduleLoadFailed: false }),
  dismissUpdate: vi.fn(),
  isModuleLoadError: () => false,
  MODULE_LOAD_ERROR_MESSAGE: '',
}))

import App from './App.svelte'

const admin = { id: 1, email: 'admin@example.ch', role: 'admin', must_change_password: false }

describe('a verification link opened again', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/verify?token=already-used')
  })

  afterEach(() => {
    cleanup()
    window.history.replaceState({}, '', '/')
    currentUser = null
  })

  // The link is a one-shot into account setup. Once there is a session it is
  // just a link to the app, and a set-up form would be nonsense.
  test('drops the user into the app when they are already signed in', async () => {
    currentUser = admin
    render(App)

    // Onto the admin's landing screen rather than `/`, which names nothing: the
    // spent link is replaced with the app, and the token goes with it.
    await waitFor(() => expect(window.location.pathname).toBe('/users'))
    expect(window.location.search).toBe('')
    expect(screen.queryByText('Set Up Your Account')).toBeNull()
  })

  test('still shows the setup form when there is no session', async () => {
    currentUser = null
    render(App)

    expect(await screen.findByText('Set Up Your Account')).toBeTruthy()
    // The token is untouched — this visitor may genuinely be setting up.
    expect(window.location.search).toBe('?token=already-used')
  })
})
