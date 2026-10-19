import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/svelte'
import { vi, describe, test, expect, afterEach } from 'vitest'

const deleteAllMyData = vi.fn()
vi.mock('../crypto/vaultStore.svelte', () => ({ deleteAllMyData: (...a: unknown[]) => deleteAllMyData(...a) }))
vi.mock('./authStore.svelte', () => ({
  // Profile's passkeys card asks; an instance without them shows none.
  getSettings: vi.fn(async () => ({ require_2fa: false })),
  listPasskeys: vi.fn(async () => []),
  getAuthState: () => ({ currentUser: { id: 1, email: 'anna@nafin.test', totp_enabled: false } }),
  disable2FA: vi.fn(),
  regenerateRecoveryCodes: vi.fn(),
  deleteAccount: vi.fn(),
}))

import SecuritySettings from './SecuritySettings.svelte'

afterEach(() => {
  cleanup()
  deleteAllMyData.mockReset()
})

async function confirmWith(password: string) {
  render(SecuritySettings)
  await fireEvent.click(screen.getByRole('button', { name: 'Delete all data' }))
  await fireEvent.input(screen.getByPlaceholderText('Current password'), { target: { value: password } })
  await fireEvent.click(screen.getByRole('button', { name: 'Delete all my data' }))
}

/** Beside Delete account, and asking for the same proof. */
describe('Delete all data', () => {
  test('says what goes and what stays before anything happens', () => {
    render(SecuritySettings)
    expect(screen.getByText(/receipts and your accounts are deleted\. You keep your login/)).toBeTruthy()
    expect(deleteAllMyData).not.toHaveBeenCalled()
  })

  test('with the password, deletes and closes', async () => {
    deleteAllMyData.mockResolvedValue('ok')
    await confirmWith('anna1234')

    expect(deleteAllMyData).toHaveBeenCalledWith('anna1234', 'anna@nafin.test')
    await waitFor(() => expect(screen.queryByPlaceholderText('Current password')).toBeNull())
  })

  test('with a wrong password, says so and stays open', async () => {
    deleteAllMyData.mockResolvedValue('wrong-password')
    await confirmWith('nope')

    expect(await screen.findByText('That password is not right.')).toBeTruthy()
    expect(screen.getByPlaceholderText('Current password')).toBeTruthy()
  })
})
