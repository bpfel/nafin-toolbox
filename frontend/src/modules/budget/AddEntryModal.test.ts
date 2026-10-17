import { cleanup, render, screen, fireEvent } from '@testing-library/svelte'
import { committingTo } from '../../lib/sync/testing'
import { describe, test, expect, vi, afterEach } from 'vitest'
import { createEmptyVault } from '../../lib/crypto/vault'
import * as engine from '../../lib/budget/budgetEngine'

// A spy around the stand-in, so a test can see which changes the dialog sent.
vi.mock('../../lib/crypto/vaultStore.svelte', async () => ({
  commit: vi.fn((await import('../../lib/sync/testing')).fakeCommit),
}))

import AddEntryModal from './AddEntryModal.svelte'
import { commit } from '../../lib/crypto/vaultStore.svelte'

afterEach(cleanup)

// de-CH's thousands separator has been both U+2019 and an ASCII apostrophe
// depending on the ICU build (77 emits one, 78 the other), so expected strings
// are formatted the way the app formats them rather than spelled out.
const chf = (n: number) =>
  n.toLocaleString('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// A real vault, because Enter runs the whole save path — which writes the name
// and category through the engine, not just the amount.
function openOn(plannedAmount: string, onsave = vi.fn(), onclose = vi.fn()) {
  const vault = committingTo(createEmptyVault())
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

    expect(monthly.value).toBe(chf(1350))

    await fireEvent.input(monthly, { target: { value: chf(1450) } })
    await fireEvent.blur(monthly)
    await fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(onsave).toHaveBeenCalledWith(entryId, '1450.00')
  })

  test('saves a figure retyped without a separator', async () => {
    const { onsave, entryId, monthly } = openOn('1350.00')

    await fireEvent.input(monthly, { target: { value: '1450' } })
    await fireEvent.blur(monthly)
    await fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(onsave).toHaveBeenCalledWith(entryId, '1450.00')
  })

  test('keeps the yearly field in step while typing', async () => {
    const { monthly } = openOn('1350.00')
    const yearly = screen.getByLabelText('Planned/yr') as HTMLInputElement

    expect(yearly.value).toBe(chf(16200))

    await fireEvent.input(monthly, { target: { value: chf(1450) } })
    expect(yearly.value).toBe(chf(17400))
  })

  test('nonsense is left alone rather than saved as a number', async () => {
    const { onsave, entryId, monthly } = openOn('1350.00')

    await fireEvent.input(monthly, { target: { value: 'abc' } })
    await fireEvent.blur(monthly)
    await fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(onsave).not.toHaveBeenCalled()
  })

  // Leaving the field is not saving. Clicking Cancel blurs the field before the
  // click lands, so an amount written on blur was saved by Cancel.
  test('Cancel drops a typed amount', async () => {
    const { onsave, onclose, monthly } = openOn('1350.00')

    await fireEvent.input(monthly, { target: { value: '1450' } })
    await fireEvent.blur(monthly)
    await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onsave).not.toHaveBeenCalled()
    expect(onclose).toHaveBeenCalled()
  })

  test('clicking outside the dialog drops it too', async () => {
    const { onsave, onclose, monthly } = openOn('1350.00')

    await fireEvent.input(monthly, { target: { value: '1450' } })
    await fireEvent.blur(monthly)
    await fireEvent.click(document.querySelector('.backdrop')!)

    expect(onsave).not.toHaveBeenCalled()
    expect(onclose).toHaveBeenCalled()
  })

  // Typed in yearly, a monthly figure is stored to four places; the box shows
  // two. Saving the name alone must not round it to what the box shows.
  test('an amount left untouched is not rewritten', async () => {
    const { onsave } = openOn('83.3333')

    await fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(onsave).not.toHaveBeenCalled()
  })

  // Enter in the name field saves the whole dialog, the amount included.
  test('Enter in the name saves a typed amount', async () => {
    const { onsave, entryId, monthly } = openOn('1350.00')

    await fireEvent.input(monthly, { target: { value: '1450' } })
    await fireEvent.keyDown(screen.getByDisplayValue('Rent'), { key: 'Enter' })

    expect(onsave).toHaveBeenCalledWith(entryId, '1450.00')
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

/**
 * A year typed into a new entry used to be stored as the monthly box showed it,
 * rounded to the rappen, so 12'550 a year came back as 12'549.96. Editing an
 * existing entry already kept four places; creating one now does too.
 */
describe('a year typed into a new entry stays that year', () => {
  function openNew() {
    const vault = committingTo(createEmptyVault())
    engine.createEntry(vault, { name: 'Rent', type: 'expense', categoryName: 'Housing' })
    const housing = engine.listCategories(vault)[0]

    render(AddEntryModal, {
      props: {
        type: 'income' as const,
        categories: [{ name: housing.name, id: housing.id }],
        vault,
        oncreated: vi.fn(),
        onclose: vi.fn(),
      },
    })
    return vault
  }

  async function add(vault: ReturnType<typeof openNew>, field: string, value: string) {
    await fireEvent.input(screen.getByLabelText('Name'), { target: { value: 'Bonus' } })
    await fireEvent.input(screen.getByLabelText(field), { target: { value } })
    await fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    const bonus = vault.budget.entries.find(e => e.name === 'Bonus')!
    return {
      stored: vault.budget.plan.find(p => p.entryId === bonus.id)?.plannedAmount,
      yearly: engine.getPlanSummary(vault).entries.find(e => e.entryId === bonus.id)?.yearlyAmount,
    }
  }

  test('from the yearly box', async () => {
    const vault = openNew()

    const { stored, yearly } = await add(vault, 'Planned/yr', '12550')

    expect(stored).toBe('1045.8333')
    expect(yearly).toBe('12550.00')
  })

  test('from the monthly box, still to the rappen', async () => {
    const vault = openNew()

    const { stored, yearly } = await add(vault, 'Planned/mo', '1045.83')

    expect(stored).toBe('1045.83')
    expect(yearly).toBe('12549.96')
  })
})

describe('a bill states the bill, not the monthly amount', () => {
  afterEach(cleanup)

  function openBill() {
    const vault = committingTo(createEmptyVault())
    engine.createEntry(vault, { name: 'Rent', type: 'expense', categoryName: 'Housing' })
    const housing = engine.listCategories(vault)[0]
    const oncreated = vi.fn()

    render(AddEntryModal, {
      props: {
        type: 'bill' as const,
        categories: [{ name: housing.name, id: housing.id }],
        vault,
        oncreated,
        onclose: vi.fn(),
      },
    })
    return { vault, oncreated }
  }

  test('there is no kind to choose — the button that opened this decided it', async () => {
    openBill()

    expect(screen.queryByLabelText('Kind')).toBeNull()
  })

  test('the monthly figure follows from the bill and its cycle, and cannot be typed', async () => {
    // 2400 four times a year is 200 a month. Deriving it is the whole point: an
    // amount typed independently of the cycle is how an entry ends up with a
    // rate that can never meet its own schedule.
    openBill()

    await fireEvent.input(screen.getByLabelText('How much is the bill'), {
      target: { value: '2400.00' },
    })
    await fireEvent.change(screen.getByLabelText('Arrives every'), { target: { value: '3' } })

    const monthly = screen.getByLabelText('Set aside each month') as HTMLInputElement
    expect(monthly.value).toBe('800.00')
    expect(monthly.readOnly).toBe(true)
  })

  test('what is saved is the bill, the cycle, and the month it lands', async () => {
    const { vault, oncreated } = openBill()

    await fireEvent.input(screen.getByLabelText('How much is the bill'), {
      target: { value: '1200.00' },
    })
    await fireEvent.input(screen.getByLabelText('Name'), { target: { value: 'Health insurance' } })
    await fireEvent.change(screen.getByLabelText('Arrives every'), { target: { value: '6' } })
    await fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    expect(oncreated).toHaveBeenCalled()
    const bill = vault.budget.entries.find(e => e.name === 'Health insurance')!
    expect(bill.type).toBe('bill')
    expect(bill.reserve).toMatchObject({ targetAmount: '1200.00', periodMonths: 6 })
    // 1200 twice a year is 200 a month, and that is what the budget diverts.
    expect(vault.budget.plan.find(p => p.entryId === bill.id)?.plannedAmount).toBe('200.00')
  })
})

describe('a purchase can be described from either end', () => {
  afterEach(cleanup)

  function openPurchase() {
    const vault = committingTo(createEmptyVault())
    engine.createEntry(vault, { name: 'Rent', type: 'expense', categoryName: 'Housing' })
    const housing = engine.listCategories(vault)[0]

    render(AddEntryModal, {
      props: {
        type: 'purchase' as const,
        categories: [{ name: housing.name, id: housing.id }],
        vault,
        oncreated: vi.fn(),
        onclose: vi.fn(),
      },
    })
    return { vault }
  }

  test('a price and a lifetime give the monthly amount', async () => {
    openPurchase()

    await fireEvent.input(screen.getByLabelText('What it costs'), { target: { value: '2400.00' } })

    // Two years by default: 2400 over 24 months.
    expect((screen.getByLabelText('Set aside each month') as HTMLInputElement).value).toBe('100.00')
  })

  test('a monthly amount gives the lifetime instead', async () => {
    // "I am willing to put aside fifteen a month — where does that get me?"
    // The period moves rather than the figure being argued with.
    const { vault } = openPurchase()

    await fireEvent.input(screen.getByLabelText('What it costs'), { target: { value: '1500.00' } })
    await fireEvent.change(screen.getByLabelText('Set aside each month'), {
      target: { value: '15.00' },
    })
    await fireEvent.input(screen.getByLabelText('Name'), { target: { value: 'Laptop' } })
    await fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    const laptop = vault.budget.entries.find(e => e.name === 'Laptop')!
    // 1500 at 15 a month is 100 months — eight years and four months.
    expect(laptop.reserve?.periodMonths).toBe(100)
  })
})

// The budget table opens this dialog as `{#if context}` and passes
// `context.editEntry`, so once it closes, reading the prop reads through a
// context that is gone. Chrome then fires blur on the amount field as it leaves
// the page, and the blur handler read `editEntry` — "Cannot read properties of
// null (reading 'editEntry')", and the page stopped updating. jsdom does not
// blur a removed field, so the test fires it.
describe('AddEntryModal — closing from the amount field', () => {
  function openInTable(onsave = vi.fn()) {
    const vault = createEmptyVault()
    const rent = engine.createEntry(vault, { name: 'Rent', type: 'expense', categoryName: 'Housing' })
    const housing = engine.listCategories(vault)[0]
    let context: { editEntry: { id: string; name: string; categoryName: string; plannedAmount: string } } | null = {
      editEntry: { id: rent.id, name: 'Rent', categoryName: 'Housing', plannedAmount: '1350.00' },
    }
    const props = {
      type: 'expense' as const,
      categories: [{ name: housing.name, id: housing.id }],
      get editEntry() {
        return context!.editEntry
      },
      vault,
      oncreated: vi.fn(),
      onclose: () => (context = null),
      onsave,
    }
    render(AddEntryModal, { props })
    return { onsave, entryId: rent.id, monthly: screen.getByLabelText('Planned/mo') as HTMLInputElement }
  }

  test('Enter saves, closes, and the blur that follows does nothing', async () => {
    const { onsave, entryId, monthly } = openInTable()

    await fireEvent.input(monthly, { target: { value: '1450' } })
    await fireEvent.keyDown(monthly, { key: 'Enter' })
    await fireEvent.blur(monthly)

    expect(onsave).toHaveBeenCalledTimes(1)
    expect(onsave).toHaveBeenCalledWith(entryId, '1450.00')
  })

  // Escape is cancel. An amount typed and not yet committed stays unwritten.
  test('Escape closes without writing what was typed', async () => {
    const { onsave, monthly } = openInTable()

    await fireEvent.input(monthly, { target: { value: '1450' } })
    await fireEvent.keyDown(window, { key: 'Escape' })
    await fireEvent.blur(monthly)

    expect(onsave).not.toHaveBeenCalled()
  })
})

// Save sends only what changed: an amount alone is one change, not a rename
// that happens to keep the name. Otherwise an entry deleted elsewhere is
// refused, and reported, twice.
describe('AddEntryModal — saving only what changed', () => {
  test('a new amount alone leaves the entry itself untouched', async () => {
    const { onsave, monthly } = openOn('1350.00')
    vi.mocked(commit).mockClear()

    await fireEvent.input(monthly, { target: { value: '1450' } })
    await fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(onsave).toHaveBeenCalled()
    expect(vi.mocked(commit).mock.calls.map(c => c[0])).not.toContain('updateEntry')
  })

  test('a new name is still sent', async () => {
    openOn('1350.00')
    vi.mocked(commit).mockClear()

    await fireEvent.input(screen.getByDisplayValue('Rent'), { target: { value: 'Miete' } })
    await fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(vi.mocked(commit).mock.calls.map(c => c[0])).toContain('updateEntry')
  })
})

// Where the mark is put on, and taken off again, outside Belege.
describe('AddEntryModal — paid automatically', () => {
  test('an expense can be marked, and Save sends the mark', async () => {
    openOn('1350.00')
    vi.mocked(commit).mockClear()

    await fireEvent.click(screen.getByLabelText(/Paid automatically/))
    await fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(vi.mocked(commit).mock.calls.find(c => c[0] === 'setEntryAutomatic')?.slice(2)).toEqual([true])
  })

  test('nothing is sent when it was left as it was', async () => {
    openOn('1350.00')
    vi.mocked(commit).mockClear()

    await fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(vi.mocked(commit).mock.calls.map(c => c[0])).not.toContain('setEntryAutomatic')
  })
})
