import { render, screen, fireEvent, waitFor } from '@testing-library/svelte'
import { tick } from 'svelte'
import { vi, describe, test, expect, beforeEach, afterEach } from 'vitest'

// Mock authStore — only verifyEmail is used by VerifyEmailPage
vi.mock('./authStore.svelte', () => ({
  verifyEmail: vi.fn().mockResolvedValue(null),
}))

import VerifyEmailPage from './VerifyEmailPage.svelte'

describe('VerifyEmailPage', () => {
  beforeEach(() => {
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
