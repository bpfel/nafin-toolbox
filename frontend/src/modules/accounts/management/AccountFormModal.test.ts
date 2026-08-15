import { cleanup, render, screen } from '@testing-library/svelte'
import userEvent from '@testing-library/user-event'
import { describe, test, expect, vi, afterEach } from 'vitest'
import type { VaultAccount } from '../../../lib/crypto/vault'

import AccountFormModal from './AccountFormModal.svelte'

afterEach(cleanup)

function open(account: VaultAccount | null = null) {
  return render(AccountFormModal, {
    props: { account, onsave: vi.fn(), onclose: vi.fn() },
  })
}

async function revealPaymentDetails(user: ReturnType<typeof userEvent.setup>) {
  const toggle = screen.getByRole('button', { name: /payment details/i })
  await user.click(toggle)
}

describe('AccountFormModal — IBAN entry', () => {
  test('groups the IBAN into blocks of four as it is typed', async () => {
    const user = userEvent.setup()
    open()
    await revealPaymentDetails(user)

    const field = screen.getByLabelText(/IBAN/i) as HTMLInputElement
    await user.type(field, 'CH9300762011623852957')

    expect(field.value).toBe('CH93 0076 2011 6238 5295 7')
  })

  test('groups a pasted IBAN that already contains its own spacing', async () => {
    const user = userEvent.setup()
    open()
    await revealPaymentDetails(user)

    const field = screen.getByLabelText(/IBAN/i) as HTMLInputElement
    await user.click(field)
    await user.paste('ch93 0076-2011 6238 5295 7')

    expect(field.value).toBe('CH93 0076 2011 6238 5295 7')
  })

  test('counts down while incomplete rather than calling it invalid', async () => {
    const user = userEvent.setup()
    open()
    await revealPaymentDetails(user)

    await user.type(screen.getByLabelText(/IBAN/i), 'CH93')

    expect(screen.getByText(/17 more characters to go/i)).toBeTruthy()
  })

  test('confirms the checksum and the detected kind once complete', async () => {
    const user = userEvent.setup()
    open()
    await revealPaymentDetails(user)

    await user.type(screen.getByLabelText(/IBAN/i), 'CH9300762011623852957')

    expect(screen.getByText(/Checksum valid/i)).toBeTruthy()
    expect(screen.getByText(/regular IBAN/i)).toBeTruthy()
  })

  test('reports a transposed digit once the length is right', async () => {
    const user = userEvent.setup()
    open()
    await revealPaymentDetails(user)

    // Last two digits swapped against the valid IBAN above.
    await user.type(screen.getByLabelText(/IBAN/i), 'CH9300762011623852975')

    expect(screen.getByText(/Not a valid Swiss or Liechtenstein IBAN/i)).toBeTruthy()
  })

  test('detects a QR-IBAN and says the bill will use a QR reference', async () => {
    const user = userEvent.setup()
    open()
    await revealPaymentDetails(user)

    await user.type(screen.getByLabelText(/IBAN/i), 'CH4431999123000889012')

    expect(screen.getByText(/QR-IBAN/i)).toBeTruthy()
  })
})
