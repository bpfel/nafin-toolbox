import { describe, test, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/svelte'
import userEvent from '@testing-library/user-event'
import { createEmptyVault, type VaultData } from '../../lib/crypto/vault'
import * as budget from '../../lib/budget/budgetEngine'
import { spendableEntries } from '../../lib/belege/belegeEngine'
import RecordForm from './RecordForm.svelte'

afterEach(cleanup)

/** Focus and select-on-focus both wait a frame, as a browser does before anyone types. */
const frame = () => new Promise(r => requestAnimationFrame(() => r(null)))

/** Type into the amount the way a person does: it is focused, then typed in. */
async function typeAmount(amount: HTMLInputElement, keys: string) {
  await userEvent.click(amount)
  await frame()
  await userEvent.keyboard(keys)
}

function vault(): VaultData {
  const v = createEmptyVault('Main')
  budget.seedDefaults(v, 'en', '2026-01')
  return v
}

function form(v: VaultData, members: { id: string; name: string }[] = []) {
  const onsubmit = vi.fn()
  render(RecordForm, { vault: v, userId: '1', members, submitLabel: 'Save', onsubmit })
  return { onsubmit, amount: screen.getByLabelText('Amount') as HTMLInputElement }
}

/**
 * Entering a receipt with one hand: the amount first, what it was preselected
 * to this person's last, today's date, and Enter to save.
 */
describe('entering a record', () => {
  test('starts on the amount', async () => {
    const { amount } = form(vault())
    await frame()
    expect(document.activeElement).toBe(amount)
  })

  test('an amount and Enter is a record, today, Unassigned when nothing was used before', async () => {
    const { onsubmit, amount } = form(vault())

    await typeAmount(amount, '12.50{Enter}')

    expect(onsubmit).toHaveBeenCalledTimes(1)
    const values = onsubmit.mock.calls[0][0]
    expect(values.amount).toBe('12.50')
    expect(values.entryId).toBeNull()
    expect(values.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  test('without an amount nothing is saved, and it says why', async () => {
    const { onsubmit, amount } = form(vault())

    await typeAmount(amount, '{Enter}')

    expect(onsubmit).not.toHaveBeenCalled()
    expect(screen.getByText('Enter an amount.')).toBeTruthy()
  })

  // The walking default: what this person entered last.
  test('starts on the entry this person used last, offered as a chip', async () => {
    const v = vault()
    const groceries = spendableEntries(v)[2]
    v.belege.push({ id: 'b', date: '2026-10-01', amount: '1.00', entryId: groceries.id, createdBy: '1', createdAt: '2026-10-01T08:00:00Z' })
    const { onsubmit, amount } = form(v)

    expect(screen.getByRole('radio', { name: groceries.name }).getAttribute('aria-checked')).toBe('true')
    await typeAmount(amount, '5{Enter}')
    expect(onsubmit.mock.calls[0][0].entryId).toBe(groceries.id)
  })

  test('is ready for the next one afterwards: the amount empties, the entry stays', async () => {
    const v = vault()
    const { amount } = form(v)
    const other = spendableEntries(v)[1]
    await userEvent.selectOptions(screen.getByLabelText('Counts against'), other.id)

    await typeAmount(amount, '5{Enter}')

    expect(amount.value).toBe('')
    expect((screen.getByLabelText('Counts against') as HTMLSelectElement).value).toBe(other.id)
  })

  test('asks who paid only in a household of two or more, defaulting to this person', async () => {
    form(vault(), [{ id: '1', name: 'Anna' }])
    expect(screen.queryByLabelText('Paid by')).toBeNull()
    cleanup()

    const { onsubmit, amount } = form(vault(), [{ id: '1', name: 'Anna' }, { id: '2', name: 'Ben' }])
    expect((screen.getByLabelText('Paid by') as HTMLSelectElement).value).toBe('1')
    expect(screen.getByRole('option', { name: 'Joint account' })).toBeTruthy()
    await typeAmount(amount, '5{Enter}')
    expect(onsubmit.mock.calls[0][0].paidBy).toBe('1')
  })
})
