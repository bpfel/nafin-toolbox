import { render, screen, fireEvent, cleanup } from '@testing-library/svelte'
import { describe, test, expect, afterEach, vi } from 'vitest'
import type { ReserveDefinition } from '../../../lib/crypto/vault'
import PurchaseDialog from './PurchaseDialog.svelte'

const RESERVE: ReserveDefinition = {
  kind: 'amortization',
  targetAmount: '1200.00',
  periodMonths: 60,
  anchorMonth: '2021-03',
}

function open(overrides: Record<string, unknown> = {}) {
  const onconfirm = vi.fn()
  const onclose = vi.fn()
  render(PurchaseDialog, {
    props: {
      entryName: 'Laptop',
      reserve: RESERVE,
      accountName: 'Reserves',
      available: '500.00',
      currentMonth: '2026-08',
      onconfirm,
      onclose,
      ...overrides,
    },
  })
  return { onconfirm, onclose }
}

describe('PurchaseDialog', () => {
  // Vitest runs without `globals`, so @testing-library's automatic cleanup
  // never registers and renders would otherwise stack up in one document.
  afterEach(cleanup)

  test('reports the real price paid and the month, so the next cycle re-prices itself', async () => {
    const { onconfirm } = open()

    // Swiss input conventions: apostrophe thousands, comma decimals.
    await fireEvent.input(screen.getByLabelText('Price paid'), {
      target: { value: "1'249,50" },
    })
    await fireEvent.click(screen.getByRole('button', { name: 'Record purchase' }))

    expect(onconfirm).toHaveBeenCalledWith('1249.50', '2026-08')
  })

  test('a shortfall is information only and never blocks the purchase', async () => {
    const { onconfirm } = open({ available: '500.00' })

    // 1200.00 against 500.00 available leaves the account 700.00 short.
    expect(screen.getByText(/below its required amount/)).toBeTruthy()

    const confirm = screen.getByRole('button', { name: 'Record purchase' })
    expect(confirm.hasAttribute('disabled')).toBe(false)

    await fireEvent.click(confirm)
    expect(onconfirm).toHaveBeenCalledWith('1200.00', '2026-08')
  })

  test('no shortfall notice when the account covers the price', () => {
    open({ available: '5000.00' })

    expect(screen.queryByText(/below its required amount/)).toBeNull()
  })

  test('refuses a price that is not a number, rather than guessing at one', async () => {
    const { onconfirm } = open()

    await fireEvent.input(screen.getByLabelText('Price paid'), { target: { value: 'about 1200' } })

    expect(screen.getByText(/Enter the price as a number/)).toBeTruthy()
    await fireEvent.click(screen.getByRole('button', { name: 'Record purchase' }))
    expect(onconfirm).not.toHaveBeenCalled()
  })
})
