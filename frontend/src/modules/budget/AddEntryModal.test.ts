import { cleanup, render, screen, fireEvent } from '@testing-library/svelte'
import { describe, test, expect, vi, afterEach } from 'vitest'
import { createEmptyVault } from '../../lib/crypto/vault'
import * as engine from '../../lib/budget/budgetEngine'

vi.mock('../../lib/crypto/vaultStore.svelte', () => ({
  markDirty: vi.fn(),
}))

import AddEntryModal from './AddEntryModal.svelte'

afterEach(cleanup)

// A real vault, because Enter runs the whole save path — which writes the name
// and category through the engine, not just the amount.
function openOn(plannedAmount: string, onsave = vi.fn(), onclose = vi.fn()) {
  const vault = createEmptyVault()
  const rent = engine.createEntry(vault, { name: 'Rent', type: 'expense', categoryName: 'Housing' })
  const housing = engine.listCategories(vault)[0]

  render(AddEntryModal, {
    props: {
      type: 'expense' as const,
      categories: [{ name: housing.name, id: housing.id }],
      editEntry: { id: rent.id, name: 'Rent', categoryName: 'Housing', plannedAmount },
      vault,
      oncreated: vi.fn(),
      onclose,
      onsave,
    },
  })
  return {
    onsave,
    onclose,
    entryId: rent.id,
    monthly: screen.getByLabelText('Planned/mo') as HTMLInputElement,
    yearly: screen.getByLabelText('Planned/yr') as HTMLInputElement,
  }
}

describe('AddEntryModal — the only way to change an amount', () => {
  // The dialog seeds the field with a de-CH formatted value, which categories
  // thousands with U+2019. It has to be able to read that back: editing a digit
  // rather than retyping the whole figure leaves the separator in place, and a
  // parser that chokes on it drops the edit with no error shown.
  test('saves an edit that keeps the thousands separator', async () => {
    const { onsave, entryId, monthly } = openOn('1350.00')

    expect(monthly.value).toBe('1’350.00')

    await fireEvent.input(monthly, { target: { value: '1’450.00' } })
    await fireEvent.blur(monthly)

    expect(onsave).toHaveBeenCalledWith(entryId, '1450.00')
  })

  test('saves a figure retyped without a separator', async () => {
    const { onsave, entryId, monthly } = openOn('1350.00')

    await fireEvent.input(monthly, { target: { value: '1450' } })
    await fireEvent.blur(monthly)

    expect(onsave).toHaveBeenCalledWith(entryId, '1450.00')
  })

  test('keeps the yearly field in step while typing', async () => {
    const { monthly } = openOn('1350.00')
    const yearly = screen.getByLabelText('Planned/yr') as HTMLInputElement

    expect(yearly.value).toBe('16’200.00')

    await fireEvent.input(monthly, { target: { value: '1’450.00' } })
    expect(yearly.value).toBe('17’400.00')
  })

  test('nonsense is left alone rather than saved as a number', async () => {
    const { onsave, entryId, monthly } = openOn('1350.00')

    await fireEvent.input(monthly, { target: { value: 'abc' } })
    await fireEvent.blur(monthly)

    expect(onsave).not.toHaveBeenCalled()
  })
})

describe('Enter in an amount field', () => {
  // It saved on blur only, so Enter looked like it had done nothing at all —
  // the dialog stayed open over an amount the user thought they had entered.
  test('writes the amount and closes the dialog', async () => {
    const { onsave, onclose, entryId, monthly } = openOn('1350.00')

    await fireEvent.input(monthly, { target: { value: '1450' } })
    await fireEvent.keyDown(monthly, { key: 'Enter' })

    expect(onsave).toHaveBeenCalledWith(entryId, '1450.00')
    expect(onclose).toHaveBeenCalled()
  })

  test('works from the yearly field too', async () => {
    const { onsave, onclose, entryId, yearly } = openOn('1350.00')

    await fireEvent.input(yearly, { target: { value: '18000' } })
    await fireEvent.keyDown(yearly, { key: 'Enter' })

    expect(onsave).toHaveBeenCalledWith(entryId, '1500.0000')
    expect(onclose).toHaveBeenCalled()
  })

  test('an unusable amount keeps the dialog open', async () => {
    const { onsave, onclose, entryId, monthly } = openOn('1350.00')

    await fireEvent.input(monthly, { target: { value: 'abc' } })
    await fireEvent.keyDown(monthly, { key: 'Enter' })

    // Closing here would discard the edit silently.
    expect(onsave).not.toHaveBeenCalled()
    expect(onclose).not.toHaveBeenCalled()
  })

  test('other keys are left alone', async () => {
    const { onclose, monthly } = openOn('1350.00')

    await fireEvent.input(monthly, { target: { value: '1450' } })
    await fireEvent.keyDown(monthly, { key: 'Tab' })

    expect(onclose).not.toHaveBeenCalled()
  })
})
