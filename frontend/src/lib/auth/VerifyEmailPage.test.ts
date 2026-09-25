import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/svelte'
import { tick } from 'svelte'
import { vi, describe, test, expect, beforeEach, afterEach } from 'vitest'

// Mock authStore — only verifyEmail is used by VerifyEmailPage
const verifyEmail = vi.fn().mockResolvedValue(null)
vi.mock('./authStore.svelte', () => ({
  verifyEmail: (token: string, password: string) => verifyEmail(token, password),
}))

import VerifyEmailPage from './VerifyEmailPage.svelte'

describe('VerifyEmailPage', () => {
  beforeEach(() => {
    verifyEmail.mockReset()
    verifyEmail.mockResolvedValue(null)
    vi.useFakeTimers()
    // Simulate arriving at /verify?token=test-token
    window.history.replaceState({}, '', '/verify?token=test-token-123')
  })

  afterEach(() => {
    vi.useRealTimers()
    window.history.replaceState({}, '', '/')
  })

  test('calls onVerified callback after successful verification instead of hard redirect', async () => {
    const onVerified = vi.fn()
    render(VerifyEmailPage, { props: { onVerified } })

    // Wait for the $effect to extract the token from URL
    await tick()

    // Fill in password fields
    const passwordInput = screen.getByLabelText('Password')
    const confirmInput = screen.getByLabelText('Confirm Password')

    await fireEvent.input(passwordInput, { target: { value: 'securepass123' } })
    await fireEvent.input(confirmInput, { target: { value: 'securepass123' } })

    // Submit the form
    const submitButton = screen.getByRole('button', { name: /set password/i })
    await fireEvent.click(submitButton)

    // Wait for verifyEmail to resolve and success state to render
    await waitFor(() => {
      expect(screen.getByText(/redirecting/i)).toBeTruthy()
    })

    // Advance past the 1500ms redirect timeout
    await vi.advanceTimersByTimeAsync(1600)

    // The component should notify the parent via callback instead of hard-navigating.
    // A hard redirect (window.location.href = '/') would destroy in-memory state
    // including the recovery key that the user needs to see.
    expect(onVerified).toHaveBeenCalled()
  })
})

describe('a link that has already been used', () => {
  beforeEach(() => {
    verifyEmail.mockReset()
    window.history.replaceState({}, '', '/verify?token=spent-token')
  })

  afterEach(() => {
    cleanup()
    window.history.replaceState({}, '', '/')
  })

  async function submit() {
    await tick()
    await fireEvent.input(screen.getByLabelText('Password'), { target: { value: 'securepass123' } })
    await fireEvent.input(screen.getByLabelText('Confirm Password'), { target: { value: 'securepass123' } })
    await fireEvent.click(screen.getByRole('button', { name: /set password/i }))
  }

  test('offers the way on instead of a dead form', async () => {
    verifyEmail.mockResolvedValue('invalid or expired token')
    const onLeave = vi.fn()
    render(VerifyEmailPage, { props: { onLeave } })

    await submit()

    // The account already exists, so retrying this form can never succeed.
    expect(await screen.findByRole('button', { name: /go to sign in/i })).toBeTruthy()
    expect(screen.queryByLabelText('Password')).toBeNull()
  })

  test('leaving drops the spent token from the URL', async () => {
    verifyEmail.mockResolvedValue('invalid or expired token')
    const onLeave = vi.fn()
    render(VerifyEmailPage, { props: { onLeave } })

    await submit()
    await fireEvent.click(await screen.findByRole('button', { name: /go to sign in/i }))

    expect(onLeave).toHaveBeenCalled()
    expect(window.location.pathname).toBe('/')
    expect(window.location.search).toBe('')
  })

  test('an ordinary failure still lets the user try again', async () => {
    verifyEmail.mockResolvedValue('password too short')
    render(VerifyEmailPage, { props: {} })

    await submit()

    expect(await screen.findByText('password too short')).toBeTruthy()
    expect(screen.getByLabelText('Password')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /go to sign in/i })).toBeNull()
  })
})
