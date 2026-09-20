import { cleanup, render, screen } from '@testing-library/svelte'
import { describe, test, expect, afterEach } from 'vitest'
import AllocatedDialog from './AllocatedDialog.svelte'
import type { AllocationPart } from '../../../lib/accounts/accountMath'

/**
 * The dialog's claim is that it shows the calculation, so what is worth testing
 * is that every part reaches the screen and the total agrees with them. The
 * arithmetic itself belongs to `accountMath` and is tested there.
 */

afterEach(cleanup)

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

/** de-CH groups thousands with a glyph the ICU data has changed more than once. */
function digitsOf(text: string | null | undefined): string {
  return (text ?? '').replace(/[^\d.-]/g, '')
}

function open(parts: AllocationPart[], total: string) {
  return render(AllocatedDialog, {
    props: { accountName: 'Reserves', parts, total, onclose: () => {} },
  })
}

describe('AllocatedDialog', () => {
  test('names the account it is explaining', () => {
    open([part()], '545.45')
    expect(screen.getByRole('dialog', { name: 'Allocated on Reserves' })).toBeTruthy()
  })

  test('lists every part with its heading', () => {
    open(
      [
        part(),
        part({ entryId: 'e2', entryName: 'New car', categoryName: 'Transport', required: '500.00' }),
      ],
      '1045.45',
    )

    expect(screen.getByText('Cantonal tax')).toBeTruthy()
    expect(screen.getByText('New car')).toBeTruthy()
    // The heading gives a bare entry name context in a list of a dozen.
    expect(screen.getByText(/Taxes/)).toBeTruthy()
    expect(screen.getByText(/Transport/)).toBeTruthy()
  })

  test('shows each part against the target it is saving towards', () => {
    const { container } = open([part()], '545.45')
    const amounts = [...container.querySelectorAll('.money')].map(n => digitsOf(n.textContent))

    // 545.45 saved, 6000.00 to reach, 545.45 total.
    expect(amounts).toContain('545.45')
    expect(amounts).toContain('6000.00')
  })

  test('dates a bill and leaves a purchase undated', () => {
    open(
      [
        part(),
        part({
          entryId: 'e2',
          entryName: 'New car',
          type: 'purchase',
          nextDueMonth: null,
          required: '500.00',
        }),
      ],
      '1045.45',
    )

    expect(screen.getByText(/due December 2027/)).toBeTruthy()
    // A purchase anchors the start of its cycle, not a deadline, so there is no
    // date to show and none is invented.
    expect(screen.queryAllByText(/due /)).toHaveLength(1)
  })

  test('the total it prints is the one it was handed', () => {
    const { container } = open(
      [
        part({ required: '545.45' }),
        part({ entryId: 'e2', entryName: 'New car', required: '500.00' }),
      ],
      '1045.45',
    )

    const total = container.querySelector('.total-figure .money')
    expect(digitsOf(total?.textContent)).toBe('1045.45')
  })

  test('an account nothing saves into says so instead of showing an empty list', () => {
    const { container } = open([], '0.00')

    expect(screen.getByText(/Nothing saves into this account/)).toBeTruthy()
    // No list, and no total either — a total of a list that is not there reads
    // as a figure that failed to load.
    expect(container.querySelector('.parts')).toBeNull()
    expect(container.querySelector('.total')).toBeNull()
  })

  test('closes on Escape and on the backdrop', async () => {
    let closed = 0
    const { container } = render(AllocatedDialog, {
      props: { accountName: 'Reserves', parts: [part()], total: '545.45', onclose: () => closed++ },
    })

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(closed).toBe(1)

    const backdrop = container.querySelector('.backdrop') as HTMLElement
    backdrop.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(closed).toBe(2)
  })

  test('a click inside the dialog does not close it', () => {
    let closed = 0
    const { container } = render(AllocatedDialog, {
      props: { accountName: 'Reserves', parts: [part()], total: '545.45', onclose: () => closed++ },
    })

    const modal = container.querySelector('.modal') as HTMLElement
    modal.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(closed).toBe(0)
  })
})
