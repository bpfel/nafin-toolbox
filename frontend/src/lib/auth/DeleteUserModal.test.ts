import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/svelte'
import { vi, describe, test, expect, afterEach } from 'vitest'

import DeleteUserModal from './DeleteUserModal.svelte'
import type { User } from './authStore.svelte'

const target: User = {
  id: 7,
  email: 'anna@example.ch',
  role: 'user',
  must_change_password: false,
  email_verified: true,
  totp_enabled: false,
  created_at: '2026-01-01T00:00:00Z',
}

function open(overrides: Partial<{ deleting: boolean; error: string | null }> = {}) {
  const ondelete = vi.fn()
  const onclose = vi.fn()
  render(DeleteUserModal, {
    props: { user: target, deleting: false, error: null, ondelete, onclose, ...overrides },
  })
  return { ondelete, onclose }
}

const continueButton = () =>
  screen.getByRole('button', { name: 'Continue' }) as HTMLButtonElement

describe('DeleteUserModal', () => {
  // No global setup file registers auto-cleanup, so the DOM is cleared by hand.
  afterEach(cleanup)

  test('cannot continue until the email is typed back', async () => {
    open()
    const input = screen.getByLabelText(/type their email address/i)

    expect(continueButton().disabled).toBe(true)

    await fireEvent.input(input, { target: { value: 'anna@example.co' } })
    expect(continueButton().disabled).toBe(true)

    await fireEvent.input(input, { target: { value: target.email } })
    expect(continueButton().disabled).toBe(false)
  })

  test('accepts the email in a different case and with stray whitespace', async () => {
    open()
    const input = screen.getByLabelText(/type their email address/i)

    await fireEvent.input(input, { target: { value: '  Anna@Example.CH ' } })
    expect(continueButton().disabled).toBe(false)
  })

  test('deletes only after the second confirmation', async () => {
    const { ondelete } = open()

    await fireEvent.input(screen.getByLabelText(/type their email address/i), {
      target: { value: target.email },
    })
    await fireEvent.click(continueButton())

    // Reaching the confirm step must not delete anything on its own.
    expect(ondelete).not.toHaveBeenCalled()

    const confirm = await screen.findByRole('button', { name: /delete permanently/i })
    await fireEvent.click(confirm)
    expect(ondelete).toHaveBeenCalledTimes(1)
  })

  test('going back re-arms the email gate', async () => {
    open()

    await fireEvent.input(screen.getByLabelText(/type their email address/i), {
      target: { value: target.email },
    })
    await fireEvent.click(continueButton())
    await fireEvent.click(await screen.findByRole('button', { name: 'Back' }))

    // The typed email survives, but the deletion button is gone again: the admin
    // has to pass the confirm step a second time.
    await waitFor(() => expect(continueButton().disabled).toBe(false))
    expect(screen.queryByRole('button', { name: /delete permanently/i })).toBeNull()
  })

  test('shows a failed deletion inside the dialog', async () => {
    open({ error: 'internal error' })

    await fireEvent.input(screen.getByLabelText(/type their email address/i), {
      target: { value: target.email },
    })
    await fireEvent.click(continueButton())

    expect(await screen.findByText('internal error')).toBeTruthy()
  })
})
