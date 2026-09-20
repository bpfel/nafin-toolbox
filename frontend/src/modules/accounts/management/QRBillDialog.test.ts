import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte'
import { describe, test, expect, vi, afterEach } from 'vitest'
import type { VaultAccount } from '../../../lib/crypto/vault'
import type { AllocationPart } from '../../../lib/accounts/accountMath'

// The dialog lazy-loads the encoder; stub it so the tests never pull in the QR
// library. None of these tests generate a code.
vi.mock('../../../lib/qrbill/encode', () => ({
  encodeSwissQR: vi.fn(() => [[true]]),
}))

import QRBillDialog from './QRBillDialog.svelte'
import {
  resetHidingAmounts,
  toggleHidingAmounts,
} from '../../../lib/util/privacy.svelte'

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

function part(overrides: Partial<AllocationPart> = {}): AllocationPart {
  return {
    entryId: 'e1',
    entryName: 'Cantonal tax',
    categoryName: 'Taxes',
    type: 'bill',
    required: '545.45',
    targetAmount: '6000.00',
    monthlyAmount: '545.45',
    nextDueMonth: '2027-12',
    ...overrides,
  }
}

function openWith(parts: AllocationPart[]) {
  return render(QRBillDialog, {
    props: {
      account: account({ iban: 'CH9300762011623852957', ibanKind: 'iban' }),
      parts,
      onclose: () => {},
    },
  })
}

describe('filling a QR bill from one of the account\'s allocations', () => {
  test('is not offered when nothing saves into the account', () => {
    openWith([])
    expect(screen.queryByLabelText('Fill from an allocation')).toBeNull()
  })

  test('offers each allocation with the month it would pay in', () => {
    openWith([
      part(),
      part({ entryId: 'e2', entryName: 'New car', monthlyAmount: '1000.00' }),
    ])

    const select = screen.getByLabelText('Fill from an allocation') as HTMLSelectElement
    const labels = Array.from(select.options).map(o => (o.textContent ?? '').trim())

    expect(labels[0]).toBe('Choose one…')
    // The figure is shown so the amount is not a surprise once it lands — and
    // it is the monthly one, so the label and the field it fills agree.
    expect(labels[1]).toContain('Cantonal tax')
    expect(labels[1]).toContain('545.45')
    expect(labels[1]).not.toMatch(/6.000\.00|6’000\.00|6'000\.00/)
    expect(labels[2]).toContain('New car')
  })

  test('choosing one fills one month of it, not the whole target', async () => {
    // A slip paid into a savings account is this month's contribution. The
    // target is what the account is working towards over a period of months;
    // putting that on the slip asks for the lot at once.
    openWith([part()])

    const select = screen.getByLabelText('Fill from an allocation') as HTMLSelectElement
    await fireEvent.change(select, { target: { value: 'e1' } })

    expect((screen.getByLabelText(/Amount/) as HTMLInputElement).value).toBe('545.45')
    expect((screen.getByLabelText('Additional information') as HTMLInputElement).value).toBe(
      'Cantonal tax',
    )
  })

  test('drops the figure from the label while amounts are hidden', () => {
    toggleHidingAmounts()
    try {
      openWith([part()])

      const select = screen.getByLabelText('Fill from an allocation') as HTMLSelectElement
      const label = (select.options[1].textContent ?? '').trim()

      // Every other figure blurs in place. A native `<option>` refuses the
      // styling that would blur it, so this one is omitted instead — a sharp
      // figure among hidden ones is the failure the toggle exists to prevent.
      expect(label).toBe('Cantonal tax')
      expect(label).not.toMatch(/\d/)
    } finally {
      resetHidingAmounts()
    }
  })

  test('lets go of the fields again, so they stay editable', async () => {
    openWith([part()])

    const select = screen.getByLabelText('Fill from an allocation') as HTMLSelectElement
    await fireEvent.change(select, { target: { value: 'e1' } })

    // The select resets rather than holding a selection, because it is a
    // shortcut for filling two fields and not a state the bill is in.
    expect(select.value).toBe('')

    const amount = screen.getByLabelText(/Amount/) as HTMLInputElement
    await fireEvent.input(amount, { target: { value: '250.00' } })
    expect(amount.value).toBe('250.00')
  })
})

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
