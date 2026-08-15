import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte'
import { describe, test, expect, vi, afterEach } from 'vitest'
import type { VaultAccount } from '../../../lib/crypto/vault'

// The dialog lazy-loads the encoder; stub it so the tests never pull in the QR
// library. None of these tests generate a code.
vi.mock('../../../lib/qrbill/encode', () => ({
  encodeSwissQR: vi.fn(() => [[true]]),
}))

import QRBillDialog from './QRBillDialog.svelte'

function account(overrides: Partial<VaultAccount> = {}): VaultAccount {
  return {
    id: 'acc-1',
    name: 'Main',
    kind: 'transactional',
    currency: 'CHF',
    currentAmount: '0.00',
    lastCorrectedAt: '2026-08-01',
    ...overrides,
  }
}

// Vitest runs without globals, so testing-library's automatic cleanup never
// registers and rendered dialogs would otherwise stack up in one document.
afterEach(cleanup)

function referenceTypeOptions(): string[] {
  const select = screen.getByLabelText('Reference type') as HTMLSelectElement
  return Array.from(select.options).map(o => o.value)
}

describe('QRBillDialog reference type is constrained by the IBAN kind', () => {
  // Banks reject a bill whose reference type does not match the IBAN it is
  // drawn on, so the wrong types are never offered in the first place.
  test('a QR-IBAN offers QRR and nothing else', () => {
    render(QRBillDialog, {
      props: {
        account: account({ iban: 'CH4431999123000889012', ibanKind: 'qr-iban' }),
        onclose: () => {},
      },
    })

    expect(referenceTypeOptions()).toEqual(['QRR'])
  })

  test('a regular IBAN offers NON and SCOR, never QRR', () => {
    render(QRBillDialog, {
      props: {
        account: account({ iban: 'CH9300762011623852957', ibanKind: 'iban' }),
        onclose: () => {},
      },
    })

    expect(referenceTypeOptions()).toEqual(['NON', 'SCOR'])
  })

  test('the default selection is legal for the IBAN kind', () => {
    render(QRBillDialog, {
      props: {
        account: account({ iban: 'CH4431999123000889012', ibanKind: 'qr-iban' }),
        onclose: () => {},
      },
    })

    expect((screen.getByLabelText('Reference type') as HTMLSelectElement).value).toBe('QRR')
  })
})

const HOLDER = {
  name: 'Anna Muster',
  street: 'Musterstrasse',
  buildingNumber: '1',
  postalCode: '8000',
  city: 'Zürich',
  country: 'CH',
}

describe('QRBillDialog generation', () => {
  test('validates before encoding and reports the offending field', async () => {
    const { container } = render(QRBillDialog, {
      props: {
        account: account({
          iban: 'CH4431999123000889012',
          ibanKind: 'qr-iban',
          holder: HOLDER,
        }),
        onclose: () => {},
      },
    })

    // A QRR reference is exactly 27 digits; this one is not.
    await fireEvent.input(screen.getByLabelText('Reference'), { target: { value: '123' } })
    await fireEvent.click(screen.getByRole('button', { name: 'Generate' }))

    await waitFor(() => {
      expect(screen.getByText(/must be exactly 27 digits/)).toBeTruthy()
    })
    expect(container.querySelector('svg')).toBeNull()
  })

  test('a valid bill runs the payload -> encode -> svg pipeline', async () => {
    const { container } = render(QRBillDialog, {
      props: {
        account: account({
          iban: 'CH4431999123000889012',
          ibanKind: 'qr-iban',
          holder: HOLDER,
        }),
        onclose: () => {},
      },
    })

    await fireEvent.input(screen.getByLabelText('Amount (CHF)'), { target: { value: "1'234.50" } })
    await fireEvent.input(screen.getByLabelText('Reference'), {
      target: { value: '210000000003139471430009017' },
    })
    await fireEvent.click(screen.getByRole('button', { name: 'Generate' }))

    await waitFor(() => {
      expect(container.querySelector('svg')).toBeTruthy()
    })
  })
})
