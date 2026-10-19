import { render, screen, fireEvent, cleanup } from '@testing-library/svelte'
import { vi, describe, test, expect, beforeEach, afterEach } from 'vitest'

// Read at call time by the mock, so each test sets what the server said.
let passkeysOffered = false
const signInWithPasskey = vi.fn()

vi.mock('./authStore.svelte', () => ({
  login: vi.fn(),
  setup: vi.fn(),
  verify2FA: vi.fn(),
  signInWithPasskey: (...a: unknown[]) => signInWithPasskey(...a),
  getAuthState: () => ({ needsSetup: false, passkeysOffered }),
}))

vi.mock('./passkey', () => ({
  passkeysSupported: () => true,
  // No autofill in these tests: the button is what they are about.
  autofillSupported: async () => false,
}))

import LoginPage from './LoginPage.svelte'

describe('the sign-in screen and passkeys', () => {
  afterEach(cleanup)
  beforeEach(() => signInWithPasskey.mockReset())

  test('shows no trace of passkeys until an admin allows them', () => {
    passkeysOffered = false
    render(LoginPage, { props: { onSuccess: () => {} } })
    expect(screen.queryByRole('button', { name: 'Sign in with a passkey' })).toBeNull()
  })

  test('once allowed, offers one to everyone beside the password', () => {
    passkeysOffered = true
    render(LoginPage, { props: { onSuccess: () => {} } })
    expect(screen.getByRole('button', { name: 'Sign in with a passkey' })).toBeTruthy()
    expect(screen.getByLabelText('Password')).toBeTruthy()
  })

  test('someone with no passkey is told where to add one', async () => {
    passkeysOffered = true
    signInWithPasskey.mockResolvedValue('cancelled')
    const onSuccess = vi.fn()
    render(LoginPage, { props: { onSuccess } })

    await fireEvent.click(screen.getByRole('button', { name: 'Sign in with a passkey' }))

    expect(await screen.findByText(/add one in Profile/)).toBeTruthy()
    expect(onSuccess).not.toHaveBeenCalled()
  })

  test('a passkey sign-in carries on into the app', async () => {
    passkeysOffered = true
    signInWithPasskey.mockResolvedValue(null)
    const onSuccess = vi.fn()
    render(LoginPage, { props: { onSuccess } })

    await fireEvent.click(screen.getByRole('button', { name: 'Sign in with a passkey' }))

    await vi.waitFor(() => expect(onSuccess).toHaveBeenCalledOnce())
  })
})
