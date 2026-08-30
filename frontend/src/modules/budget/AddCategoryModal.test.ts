import { cleanup, render, screen, fireEvent } from '@testing-library/svelte'
import { describe, test, expect, vi, afterEach } from 'vitest'
import type { VaultData } from '../../lib/crypto/vault'

vi.mock('../../lib/crypto/vaultStore.svelte', () => ({
  markDirty: vi.fn(),
}))

import AddCategoryModal from './AddCategoryModal.svelte'

afterEach(cleanup)

function openOn(plannedAmount: string, onsave = vi.fn()) {
  render(AddCategoryModal, {
    props: {
      type: 'expense' as const,
      groups: [{ name: 'Housing', id: 'g1' }],
      editCategory: { id: 'c1', name: 'Rent', groupName: 'Housing', plannedAmount },
      vault: { categories: [], categoryGroups: [] } as unknown as VaultData,
      oncreated: vi.fn(),
      onclose: vi.fn(),
      onsave,
    },
  })
  return { onsave, monthly: screen.getByLabelText('Planned/mo') as HTMLInputElement }
}

describe('AddCategoryModal — the only way to change an amount', () => {
  // The dialog seeds the field with a de-CH formatted value, which groups
  // thousands with U+2019. It has to be able to read that back: editing a digit
  // rather than retyping the whole figure leaves the separator in place, and a
  // parser that chokes on it drops the edit with no error shown.
  test('saves an edit that keeps the thousands separator', async () => {
    const { onsave, monthly } = openOn('1350.00')

    expect(monthly.value).toBe('1’350.00')

    await fireEvent.input(monthly, { target: { value: '1’450.00' } })
    await fireEvent.blur(monthly)

    expect(onsave).toHaveBeenCalledWith('c1', '1450.00')
  })

  test('saves a figure retyped without a separator', async () => {
    const { onsave, monthly } = openOn('1350.00')

    await fireEvent.input(monthly, { target: { value: '1450' } })
    await fireEvent.blur(monthly)

    expect(onsave).toHaveBeenCalledWith('c1', '1450.00')
  })

  test('keeps the yearly field in step while typing', async () => {
    const { monthly } = openOn('1350.00')
    const yearly = screen.getByLabelText('Planned/yr') as HTMLInputElement

    expect(yearly.value).toBe('16’200.00')

    await fireEvent.input(monthly, { target: { value: '1’450.00' } })
    expect(yearly.value).toBe('17’400.00')
  })

  test('nonsense is left alone rather than saved as a number', async () => {
    const { onsave, monthly } = openOn('1350.00')

    await fireEvent.input(monthly, { target: { value: 'abc' } })
    await fireEvent.blur(monthly)

    expect(onsave).not.toHaveBeenCalled()
  })
})
