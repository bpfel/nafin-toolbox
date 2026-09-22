import { cleanup, render, screen } from '@testing-library/svelte'
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { tick } from 'svelte'
import Sortable from 'sortablejs'
import type { VaultAccount, VaultEntry, VaultData } from '../../../lib/crypto/vault'

// The vault is a plain object mutated in place by the engine, so the store is
// stubbed with a live getter rather than a snapshot.
const store = vi.hoisted(() => ({ vault: null as VaultData | null }))

vi.mock('../../../lib/crypto/vaultStore.svelte', () => ({
  getVaultState: () => ({
    get vault() {
      return store.vault
    },
  }),
  markDirty: vi.fn(),
}))

import { clearEditing, toggleEditing } from '../../../lib/util/editMode.svelte'
import AccountManagement from './AccountManagement.svelte'

/** Puts the accounts module into edit mode for the rest of the test. */
function editMode() {
  toggleEditing('accounts')
}

function account(id: string, name: string, currentAmount = '100.00'): VaultAccount {
  return {
    id,
    name,
    kind: 'transactional',
    currency: 'CHF',
    currentAmount,
    lastCorrectedAt: '2026-08-01',
  }
}

function vault(...accounts: VaultAccount[]): VaultData {
  return {
    version: 8,
    tour: { completedAt: null, dismissedAt: null },
    budget: { categories: [], entries: [], plan: [], snapshots: [] },
    accounts,
  }
}

// A bill whose anchor month IS the month under test is due now, so the whole
// target is already required — the simplest way to put a known figure in
// `requiredForAccount` without reaching into the reserve maths.
function dueReserve(id: string, sinkAccountId: string, targetAmount: string): VaultEntry {
  return {
    id,
    name: `${id} reserve`,
    type: 'bill',
    sortOrder: 0,
    archived: false,
    categoryId: 'g1',
    sourceAccountId: 'main',
    sinkAccountId,
    reserve: { targetAmount, periodMonths: 12, anchorMonth: '2026-08' },
  }
}

// de-CH groups thousands with a character that has changed with the ICU data
// more than once, so the assertions compare the digits rather than the glyph.
function totalAt(testId: string): string {
  return (screen.getByTestId(testId).textContent ?? '').replace(/[^\d.-]/g, '')
}

beforeEach(() => {
  store.vault = null
  // Edit mode is module state shared by every test in the file, so each one
  // starts read-only — the default the module actually ships with.
  clearEditing()
})

// Vitest runs without globals, so testing-library's automatic cleanup never
// registers and rendered screens would otherwise stack up in one document.
afterEach(cleanup)

describe('reading what Allocated is made of', () => {
  function vaultWithReserves(): VaultData {
    const v = vault(account('main', 'Main'), account('res', 'Reserves'))
    v.budget.categories = [{ id: 'g1', name: 'Taxes', side: 'expense', sortOrder: 0 }]
    v.budget.entries = [
      dueReserve('tax', 'res', '3000.00'),
      dueReserve('radio', 'res', '360.00'),
      // Sinks elsewhere, so it must not appear under Reserves.
      dueReserve('holiday', 'main', '900.00'),
    ]
    return v
  }

  test('the control is there without edit mode — reading changes nothing', () => {
    store.vault = vaultWithReserves()
    render(AccountManagement, { props: { currentMonth: '2026-08' } })

    expect(screen.getByRole('button', { name: 'What is allocated on Reserves' })).toBeTruthy()
  })

  test('opens a dialog naming only the parts that sink into that account', async () => {
    store.vault = vaultWithReserves()
    render(AccountManagement, { props: { currentMonth: '2026-08' } })

    screen.getByRole('button', { name: 'What is allocated on Reserves' }).click()
    await tick()

    expect(screen.getByRole('dialog', { name: 'Allocated on Reserves' })).toBeTruthy()
    expect(screen.getByText('tax reserve')).toBeTruthy()
    expect(screen.getByText('radio reserve')).toBeTruthy()
    expect(screen.queryByText('holiday reserve')).toBeNull()
  })

  test("the dialog's total is the figure on the card behind it", async () => {
    store.vault = vaultWithReserves()
    const { container } = render(AccountManagement, { props: { currentMonth: '2026-08' } })

    screen.getByRole('button', { name: 'What is allocated on Reserves' }).click()
    await tick()

    // Both bills are due this month, so the whole of each target is required.
    const total = container.querySelector('.total-figure .money')
    expect((total?.textContent ?? '').replace(/[^\d.-]/g, '')).toBe('3360.00')
  })

  test('an account nothing saves into still opens, and says so', async () => {
    store.vault = vault(account('main', 'Main'))
    render(AccountManagement, { props: { currentMonth: '2026-08' } })

    screen.getByRole('button', { name: 'What is allocated on Main' }).click()
    await tick()

    expect(screen.getByText(/Nothing saves into this account/)).toBeTruthy()
  })
})

describe('AccountManagement delete affordance', () => {
  // `deleteAccount` throws on the last remaining account — the vault invariant
  // is that at least one always exists. The UI must not offer an action whose
  // only possible outcome is an error.
  test('delete is disabled when only one account remains', () => {
    store.vault = vault(account('a', 'Main'))
    editMode()

    render(AccountManagement, { props: { currentMonth: '2026-08' } })

    const button = screen.getByRole('button', { name: 'Delete Main' })
    expect((button as HTMLButtonElement).disabled).toBe(true)
  })

  test('delete is enabled once a second account exists', () => {
    store.vault = vault(account('a', 'Main'), account('b', 'Reserves'))
    editMode()

    render(AccountManagement, { props: { currentMonth: '2026-08' } })

    expect((screen.getByRole('button', { name: 'Delete Main' }) as HTMLButtonElement).disabled).toBe(
      false,
    )
    expect(
      (screen.getByRole('button', { name: 'Delete Reserves' }) as HTMLButtonElement).disabled,
    ).toBe(false)
  })
})

describe('AccountManagement reorder affordance', () => {
  // `vault.accounts` has no sortOrder — the array order is the display order,
  // and `onEnd` reads it back out of these attributes.
  test('every card carries its account id for the drop handler to read', () => {
    store.vault = vault(account('a', 'Main'), account('b', 'Reserves'))

    const { container } = render(AccountManagement, { props: { currentMonth: '2026-08' } })

    const ids = Array.from(container.querySelectorAll('.account-card')).map(
      c => (c as HTMLElement).dataset.accountId,
    )
    expect(ids).toEqual(['a', 'b'])
  })

  test('cards render in vault.accounts order', () => {
    store.vault = vault(account('b', 'Reserves'), account('a', 'Main'))

    const { container } = render(AccountManagement, { props: { currentMonth: '2026-08' } })

    const ids = Array.from(container.querySelectorAll('.account-card')).map(
      c => (c as HTMLElement).dataset.accountId,
    )
    expect(ids).toEqual(['b', 'a'])
  })

  test('each card exposes a labelled drag handle in edit mode', () => {
    store.vault = vault(account('a', 'Main'), account('b', 'Reserves'))
    editMode()

    render(AccountManagement, { props: { currentMonth: '2026-08' } })

    expect(screen.getByLabelText('Drag to reorder Main').classList.contains('drag-handle')).toBe(
      true,
    )
    expect(screen.getByLabelText('Drag to reorder Reserves')).toBeTruthy()
  })

  // Dragging the only account can only put it back where it was.
  test('no drag handle is offered when a single account exists', () => {
    store.vault = vault(account('a', 'Main'))
    editMode()

    const { container } = render(AccountManagement, { props: { currentMonth: '2026-08' } })

    expect(container.querySelectorAll('.drag-handle')).toHaveLength(0)
  })
})

describe('AccountManagement edit mode', () => {
  // The module is read-only by default: you can read your figures and keep them
  // truthful, but you cannot restructure anything until you ask to.
  //
  // Adding an account is not among them any more: it is the ordinary thing a
  // person comes to this screen to do, and it was behind a mode you had to know
  // existed. It lives in the screen's action strip now, always visible, which is
  // why neither of these looks for it.
  test('the structural affordances are absent by default', () => {
    store.vault = vault(account('a', 'Main'), account('b', 'Reserves'))

    const { container } = render(AccountManagement, { props: { currentMonth: '2026-08' } })

    expect(container.querySelectorAll('.drag-handle')).toHaveLength(0)
    expect(screen.queryByRole('button', { name: 'Edit Main' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Delete Main' })).toBeNull()
  })

  test('edit mode reveals every one of them', () => {
    store.vault = vault(account('a', 'Main'), account('b', 'Reserves'))
    editMode()

    const { container } = render(AccountManagement, { props: { currentMonth: '2026-08' } })

    expect(container.querySelectorAll('.drag-handle')).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Edit Main' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Delete Main' })).toBeTruthy()
  })

  // The one exception worth pinning down. Correcting the balance is how the
  // projection stays honest; burying it behind a mode would let the anchor go
  // stale, which is the exact failure the anchor pair exists to prevent.
  test('correcting a balance is available in both modes', () => {
    store.vault = vault(account('a', 'Main'))

    render(AccountManagement, { props: { currentMonth: '2026-08' } })
    expect(screen.getAllByRole('button', { name: 'Correct the balance of Main' })).toHaveLength(1)

    cleanup()
    editMode()

    render(AccountManagement, { props: { currentMonth: '2026-08' } })
    expect(screen.getAllByRole('button', { name: 'Correct the balance of Main' })).toHaveLength(1)
  })

  test('toggling edit mode after render takes effect without a remount', async () => {
    store.vault = vault(account('a', 'Main'), account('b', 'Reserves'))

    const { container } = render(AccountManagement, { props: { currentMonth: '2026-08' } })
    expect(container.querySelectorAll('.drag-handle')).toHaveLength(0)

    editMode()
    await tick()

    expect(container.querySelectorAll('.drag-handle')).toHaveLength(2)
  })

  // Hiding the handle removes the affordance; only the instance option stops a
  // drag from being started at all.
  test('the sortable instance is disabled until edit mode, and re-enabled with it', async () => {
    store.vault = vault(account('a', 'Main'), account('b', 'Reserves'))

    const { container } = render(AccountManagement, { props: { currentMonth: '2026-08' } })
    const instance = Sortable.get(container.querySelector('.cards') as HTMLElement)!
    expect(instance.option('disabled')).toBe(true)

    editMode()
    await tick()
    expect(instance.option('disabled')).toBe(false)

    // …and locks again on the way out.
    editMode()
    await tick()
    expect(instance.option('disabled')).toBe(true)
  })
})

describe('AccountManagement totals row', () => {
  // The three sums, one of which is built from a per-account figure that is
  // already negative — a shortfall on one account must pull the total down
  // rather than being clamped at zero somewhere along the way.
  test('sums projected, required and available across every account', () => {
    const main = account('a', 'Main', '1200.50')
    const reserves = account('b', 'Reserves', '300.25')
    const v = vault(main, reserves)
    // Reserves: required 1200.00 against 300.25 projected, i.e. -899.75 available.
    v.budget.entries.push(dueReserve('c1', 'b', '1200.00'))
    store.vault = v

    render(AccountManagement, { props: { currentMonth: '2026-08' } })

    expect(totalAt('total-projected')).toBe('1500.75')
    expect(totalAt('total-required')).toBe('1200.00')
    // 1200.50 + (-899.75); also 1500.75 - 1200.00, which is the check.
    expect(totalAt('total-available')).toBe('300.75')
  })

  // 0.10 + 0.20 + 0.10 is 0.4000000000000001 in binary floating point. Summing
  // in cents makes the total exactly 40, and this pins the rendered figure so
  // that drift can never reach the screen — printing a raw float sum, or
  // formatting one without a fraction-digit clamp, fails here.
  test('sums in cents, not in floats', () => {
    store.vault = vault(
      account('a', 'One', '0.10'),
      account('b', 'Two', '0.20'),
      account('c', 'Three', '0.10'),
    )

    render(AccountManagement, { props: { currentMonth: '2026-08' } })

    expect(totalAt('total-projected')).toBe('0.40')
    expect(totalAt('total-available')).toBe('0.40')
  })

  test('a total available below zero is shown as a shortfall', () => {
    const main = account('a', 'Main', '100.00')
    const v = vault(main)
    v.budget.entries.push(dueReserve('c1', 'a', '500.00'))
    store.vault = v

    render(AccountManagement, { props: { currentMonth: '2026-08' } })

    expect(totalAt('total-available')).toBe('-400.00')
    expect(screen.getByTestId('total-available').classList.contains('negative')).toBe(true)
  })

  test('a non-negative total is not marked as a shortfall', () => {
    store.vault = vault(account('a', 'Main', '100.00'))

    render(AccountManagement, { props: { currentMonth: '2026-08' } })

    expect(screen.getByTestId('total-available').classList.contains('negative')).toBe(false)
  })

  // Nothing to sum until the vault is open, and a row of zeroes would read as
  // a real answer.
  test('no totals row before the vault has loaded', () => {
    store.vault = null

    render(AccountManagement, { props: { currentMonth: '2026-08' } })

    expect(screen.queryByTestId('account-totals')).toBeNull()
  })

  // The totals live outside the sortable container, so a drop can never land a
  // card past them.
  test('the totals row is not inside the sortable container', () => {
    store.vault = vault(account('a', 'Main'), account('b', 'Reserves'))

    const { container } = render(AccountManagement, { props: { currentMonth: '2026-08' } })

    expect(container.querySelector('.cards [data-testid="account-totals"]')).toBeNull()
    expect(container.querySelector('[data-testid="account-totals"]')).toBeTruthy()
  })
})

describe('AccountManagement reordering inside the scroller', () => {
  test('the sortable row is told it runs horizontally', () => {
    store.vault = vault(account('a', 'Main'), account('b', 'Reserves'))

    const { container } = render(AccountManagement, { props: { currentMonth: '2026-08' } })

    const cards = container.querySelector('.cards') as HTMLElement
    expect(Sortable.get(cards)!.options.direction).toBe('horizontal')
  })

  // Sortable moves the DOM nodes itself and the handler reads the new order
  // back off them, so a drop is reproduced by doing exactly that. This is what
  // proves reordering survived the move into a scroll container: the handler
  // never measures or positions anything, it only reads `data-account-id`.
  test('a drop still writes the new order back to the vault', async () => {
    const v = vault(account('a', 'Main'), account('b', 'Reserves'))
    store.vault = v
    editMode()

    const { container } = render(AccountManagement, { props: { currentMonth: '2026-08' } })
    const cards = container.querySelector('.cards') as HTMLElement
    const instance = Sortable.get(cards)!

    // What sortable does on drop: the node moves, then onEnd fires.
    const [first, second] = Array.from(cards.querySelectorAll('.account-card'))
    cards.insertBefore(second, first)
    instance.options.onEnd?.({} as Sortable.SortableEvent)
    await tick()

    expect(v.accounts.map(a => a.id)).toEqual(['b', 'a'])
    expect(
      Array.from(cards.querySelectorAll('.account-card')).map(
        c => (c as HTMLElement).dataset.accountId,
      ),
    ).toEqual(['b', 'a'])
  })
})

describe('AccountManagement QR capability', () => {
  // Capability follows from holding an IBAN, not from the account's kind.
  test('the QR bill action appears only for an account with an IBAN', () => {
    const withIban = account('a', 'Main')
    withIban.iban = 'CH9300762011623852957'
    withIban.ibanKind = 'iban'
    store.vault = vault(withIban, account('b', 'Wallet'))

    render(AccountManagement, { props: { currentMonth: '2026-08' } })

    expect(screen.getByRole('button', { name: 'QR bill for Main' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'QR bill for Wallet' })).toBeNull()
  })
})
