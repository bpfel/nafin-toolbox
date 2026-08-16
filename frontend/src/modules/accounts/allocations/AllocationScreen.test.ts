import { render, screen, fireEvent, cleanup } from '@testing-library/svelte'
import { describe, test, expect, afterEach, beforeEach, vi } from 'vitest'
import { tick } from 'svelte'
import type { VaultCategory, VaultData } from '../../../lib/crypto/vault'

// The screen reads the vault through the store, and the store is module state.
// Swapping it for a plain object lets the tests drive real vault data without
// crypto, network, or a login.
let testVault: VaultData | null = null

vi.mock('../../../lib/crypto/vaultStore.svelte', () => ({
  getVaultState: () => ({
    get vault() {
      return testVault
    },
  }),
  markDirty: vi.fn(),
}))

import { clearEditing, toggleEditing } from '../../../lib/util/editMode.svelte'
import AllocationScreen from './AllocationScreen.svelte'

const now = new Date()
const YEAR = now.getFullYear()
const MONTH = now.getMonth() + 1
const CURRENT_MONTH = `${String(YEAR).padStart(4, '0')}-${String(MONTH).padStart(2, '0')}`

function category(overrides: Partial<VaultCategory> & { id: string; name: string }): VaultCategory {
  return {
    type: 'expense',
    sortOrder: 0,
    archived: false,
    groupId: 'g1',
    sourceAccountId: 'main',
    sinkAccountId: null,
    ...overrides,
  }
}

function makeVault(): VaultData {
  return {
    version: 4,
    accounts: [
      {
        id: 'main',
        name: 'Main',
        kind: 'transactional',
        currency: 'CHF',
        currentAmount: '2000.00',
        // Anchored this month, so no month has elapsed and the plan is not
        // projected on top of it — the account figures stay independent of the
        // planned amounts below.
        lastCorrectedAt: `${CURRENT_MONTH}-01`,
      },
      {
        id: 'reserves',
        name: 'Reserves',
        kind: 'reserves',
        currency: 'CHF',
        currentAmount: '0.00',
        lastCorrectedAt: `${CURRENT_MONTH}-01`,
      },
    ],
    budget: {
      categoryGroups: [{ id: 'g1', name: 'Everything', type: 'expense', sortOrder: 0 }],
      categories: [
        category({
          id: 'salary',
          name: 'Salary',
          type: 'income',
          sortOrder: 0,
          sourceAccountId: null,
          sinkAccountId: 'main',
        }),
        category({ id: 'rent', name: 'Rent', sortOrder: 1 }),
        category({
          id: 'laptop',
          name: 'Laptop',
          sortOrder: 2,
          sinkAccountId: 'reserves',
          reserve: {
            kind: 'amortization',
            targetAmount: '1200.00',
            periodMonths: 60,
            anchorMonth: CURRENT_MONTH,
          },
        }),
      ],
      plan: [
        { categoryId: 'salary', plannedAmount: '900.00' },
        { categoryId: 'rent', plannedAmount: '500.00' },
        { categoryId: 'laptop', plannedAmount: '100.00' },
      ],
      archives: [],
    },
  }
}

// Three expense categories across two named groups plus one whose group is
// gone. The groups are declared in the *opposite* order to their sortOrder, so
// a screen that grouped by encounter order would get this wrong.
function groupedVault(): VaultData {
  const vault = makeVault()
  vault.budget.categoryGroups = [
    { id: 'g-housing', name: 'Housing', type: 'expense', sortOrder: 20 },
    { id: 'g-fun', name: 'Fun', type: 'expense', sortOrder: 10 },
  ]
  vault.budget.categories = [
    category({ id: 'rent', name: 'Rent', groupId: 'g-housing', sortOrder: 0 }),
    category({ id: 'games', name: 'Games', groupId: 'g-fun', sortOrder: 1 }),
    // Its group was deleted — the row must survive that.
    category({ id: 'orphan', name: 'Orphan', groupId: 'g-deleted', sortOrder: 2 }),
  ]
  vault.budget.plan = [
    { categoryId: 'rent', plannedAmount: '500.00' },
    { categoryId: 'games', plannedAmount: '50.00' },
    { categoryId: 'orphan', plannedAmount: '25.00' },
  ]
  return vault
}

function groupHeaders() {
  return screen.getAllByTestId('allocation-group')
}

function groupNames() {
  return groupHeaders().map(el => el.querySelector('.group-name')!.textContent!.trim())
}

function totals() {
  return {
    unallocated: screen.getByTestId('total-unallocated').textContent?.trim(),
    netChange: screen.getByTestId('total-net-change').textContent?.trim(),
  }
}

describe('AllocationScreen', () => {
  beforeEach(() => {
    testVault = makeVault()
    // Routing is structural, so its expander only exists in edit mode. Most of
    // these tests are about what routing does, so they open it there.
    clearEditing()
    toggleEditing('accounts')
  })

  // Vitest runs without `globals`, so @testing-library's automatic cleanup
  // never registers and renders would otherwise stack up in one document.
  afterEach(() => {
    cleanup()
    clearEditing()
  })

  test('shows both totals, and they differ by exactly the set-aside', () => {
    render(AllocationScreen)

    // unallocated = 900 − (500 rent + 100 laptop) = 300 — zero-based reading.
    // netChange = 900 − 500, because the laptop set-aside never leaves net worth.
    expect(totals()).toEqual({ unallocated: '300.00', netChange: '400.00' })
  })

  test('an income category is asked only where money lands, never where it comes from', async () => {
    render(AllocationScreen)

    const editButtons = screen.getAllByRole('button', { name: 'Edit routing' })
    await fireEvent.click(editButtons[0]) // Salary, the only income category

    expect(screen.getByLabelText('Lands in')).toBeTruthy()
    expect(screen.queryByLabelText('Paid from')).toBeNull()
    expect(screen.queryByText('Leaves my accounts')).toBeNull()
  })

  test('set-aside is the gate that reveals the reserve fields', async () => {
    render(AllocationScreen)

    const editButtons = screen.getAllByRole('button', { name: 'Edit routing' })
    await fireEvent.click(editButtons[1]) // Rent, routed as spending

    // Spending has nowhere to accumulate, so there is nothing to define.
    expect(screen.getByLabelText('Paid from')).toBeTruthy()
    expect(screen.queryByLabelText('Saving towards')).toBeNull()

    await fireEvent.click(screen.getByLabelText('Set aside into'))

    // Routing the expense into an account is what makes a reserve possible.
    expect(screen.getByLabelText('Saving towards')).toBeTruthy()
    // …and the sink is a real account, never null.
    expect(testVault!.budget.categories.find(c => c.id === 'rent')!.sinkAccountId).toBe('main')
  })

  test('routing an expense into an account moves netChange but not unallocated', async () => {
    render(AllocationScreen)

    const editButtons = screen.getAllByRole('button', { name: 'Edit routing' })
    await fireEvent.click(editButtons[1])
    await fireEvent.click(screen.getByLabelText('Set aside into'))

    // Just as much is left unallocated: rent is budgeted either way. But
    // nothing leaves the accounts any more, so net worth grows by the lot.
    expect(totals()).toEqual({ unallocated: '300.00', netChange: '900.00' })
  })

  test('an under-funded account is reported, and never blocks anything', async () => {
    // An obligation far larger than the account can cover.
    testVault!.budget.categories.push(
      category({
        id: 'tax',
        name: 'Tax',
        sortOrder: 3,
        sinkAccountId: 'reserves',
        reserve: {
          kind: 'obligation',
          targetAmount: '3000.00',
          periodMonths: 3,
          anchorMonth: CURRENT_MONTH,
        },
      }),
    )

    render(AllocationScreen)

    // Reserves holds 0.00 against a 3000.00 obligation falling due this month.
    expect(screen.getByText(/is 3'000\.00 short|is 3’000\.00 short/)).toBeTruthy()
    expect(screen.getByText(/Nothing is blocked/)).toBeTruthy()
  })

  test('routing a set-aside back to spending takes its reserve with it', async () => {
    render(AllocationScreen)

    const editButtons = screen.getAllByRole('button', { name: 'Edit routing' })
    await fireEvent.click(editButtons[2]) // Laptop, a set-aside with an amortization
    expect(screen.getByLabelText('Saving towards')).toBeTruthy()

    await fireEvent.click(screen.getByLabelText('Leaves my accounts'))

    // A reserve has to accumulate somewhere, so a null sink cannot keep one.
    expect(screen.queryByLabelText('Saving towards')).toBeNull()
    expect(testVault!.budget.categories.find(c => c.id === 'laptop')!.reserve).toBeUndefined()
  })

  test('recording a purchase re-prices the next cycle and restarts it', async () => {
    render(AllocationScreen)

    await fireEvent.click(screen.getByRole('button', { name: 'Bought it…' }))
    await fireEvent.input(screen.getByLabelText('Price paid'), { target: { value: '1450.00' } })
    await fireEvent.input(screen.getByLabelText('Month of purchase'), {
      target: { value: '2026-04' },
    })
    await fireEvent.click(screen.getByRole('button', { name: 'Record purchase' }))

    // The real price paid becomes the next cycle's target — replacement cost
    // keeps itself up to date — and the cycle restarts at the purchase month.
    expect(testVault!.budget.categories.find(c => c.id === 'laptop')!.reserve).toEqual({
      kind: 'amortization',
      targetAmount: '1450.00',
      periodMonths: 60,
      anchorMonth: '2026-04',
    })
    expect(screen.queryByRole('button', { name: 'Record purchase' })).toBeNull()
  })

  test('an under-funded amortization moves its date instead of warning', () => {
    // Nothing accumulated yet, 1200 to find at the 100/month planned.
    testVault!.accounts[1].currentAmount = '0.00'
    render(AllocationScreen)

    expect(screen.getByText(/affordable from/i)).toBeTruthy()
    expect(screen.queryByText(/short of what is planned/)).toBeNull()
  })

  describe('grouping', () => {
    beforeEach(() => {
      testVault = groupedVault()
    })

    test("groups follow the budget group's sortOrder, not the order they are met", () => {
      render(AllocationScreen)

      // Fun sorts at 10, Housing at 20, and a vanished group has no order at
      // all, so it lands last.
      expect(groupNames()).toEqual(['Fun', 'Housing', 'Other'])
    })

    test('each group header carries its own planned subtotal', () => {
      render(AllocationScreen)

      const subtotals = groupHeaders().map(el =>
        el.querySelector('.group-subtotal')!.textContent!.trim(),
      )
      expect(subtotals).toEqual(['50.00', '500.00', '25.00'])
    })

    test('collapsing a group hides only that group’s rows', async () => {
      render(AllocationScreen)

      expect(screen.queryByText('Games')).toBeTruthy()
      expect(screen.queryByText('Rent')).toBeTruthy()

      await fireEvent.click(groupHeaders()[0]) // Fun

      expect(screen.queryByText('Games')).toBeNull()
      expect(screen.queryByText('Rent')).toBeTruthy()
      expect(screen.queryByText('Orphan')).toBeTruthy()
      // The header itself stays, subtotal and all — that is the point of it.
      expect(groupNames()).toEqual(['Fun', 'Housing', 'Other'])
      expect(groupHeaders()[0].getAttribute('aria-expanded')).toBe('false')

      // And it folds back open.
      await fireEvent.click(groupHeaders()[0])
      expect(screen.queryByText('Games')).toBeTruthy()
    })

    test('a category whose group was deleted still appears, under Other', () => {
      render(AllocationScreen)

      expect(screen.getByText('Orphan')).toBeTruthy()
      expect(groupNames()).toContain('Other')
    })

    test('income and expenses stay separate sections, each grouped on its own', () => {
      // Two income groups, because a side with only one renders no header at
      // all — a lone group is not a grouping. One would leave nothing to
      // observe about income's ordering.
      testVault!.budget.categoryGroups.push(
        { id: 'g-pay', name: 'Pay', type: 'income', sortOrder: 5 },
        { id: 'g-side', name: 'Side work', type: 'income', sortOrder: 6 },
      )
      testVault!.budget.categories.push(
        category({
          id: 'salary',
          name: 'Salary',
          type: 'income',
          groupId: 'g-pay',
          sortOrder: 3,
          sourceAccountId: null,
          sinkAccountId: 'main',
        }),
        category({
          id: 'freelance',
          name: 'Freelance',
          type: 'income',
          groupId: 'g-side',
          sortOrder: 4,
          sourceAccountId: null,
          sinkAccountId: 'main',
        }),
      )

      render(AllocationScreen)

      // Income groups are listed inside "Money in", ahead of every expense
      // group, rather than merged into the expense ordering.
      expect(groupNames()).toEqual(['Pay', 'Side work', 'Fun', 'Housing', 'Other'])
      expect(screen.getByText('Money in')).toBeTruthy()
    })

    test('a side with a single group renders no header for it', () => {
      // The default fixture has exactly one income category, so income has one
      // group. Expenses have three and keep theirs.
      render(AllocationScreen)

      expect(groupNames()).toEqual(['Fun', 'Housing', 'Other'])
    })
  })
})

describe('AllocationScreen edit mode', () => {
  beforeEach(() => {
    testVault = makeVault()
    clearEditing()
  })

  afterEach(() => {
    cleanup()
    clearEditing()
  })

  test('the routing expander is absent by default and present in edit mode', async () => {
    render(AllocationScreen)
    expect(screen.queryAllByRole('button', { name: 'Edit routing' })).toHaveLength(0)

    toggleEditing('accounts')
    await tick()

    expect(screen.queryAllByRole('button', { name: 'Edit routing' })).toHaveLength(3)
  })

  // Reading the plan is never gated: the flow lines, the figures and the group
  // headers are all there before anything is unlocked.
  test('the figures and the flow lines read fine read-only', () => {
    render(AllocationScreen)

    expect(totals()).toEqual({ unallocated: '300.00', netChange: '400.00' })
    expect(screen.getByText('Rent')).toBeTruthy()
    expect(screen.getByText(/leaves your accounts/)).toBeTruthy()
  })

  // A purchase records something that actually happened; it restructures nothing.
  test('recording a purchase stays available read-only', async () => {
    render(AllocationScreen)

    await fireEvent.click(screen.getByRole('button', { name: 'Bought it…' }))
    await fireEvent.input(screen.getByLabelText('Price paid'), { target: { value: '1450.00' } })
    await fireEvent.input(screen.getByLabelText('Month of purchase'), {
      target: { value: '2026-04' },
    })
    await fireEvent.click(screen.getByRole('button', { name: 'Record purchase' }))

    expect(testVault!.budget.categories.find(c => c.id === 'laptop')!.reserve).toEqual({
      kind: 'amortization',
      targetAmount: '1450.00',
      periodMonths: 60,
      anchorMonth: '2026-04',
    })
  })

  // The row splits into general information (name, kind, amount, flow) and
  // detail (reserve status, timing, purchase). The rule between the two only
  // exists when there is a detail half to separate.
  test('only a row with a detail half gets the separator', async () => {
    render(AllocationScreen)

    const rows = Array.from(document.querySelectorAll('.allocation-row'))
    const detailed = rows.map(row => row.querySelector('.row-detail') !== null)

    // Salary (income) and Rent (plain spending) have nothing below the flow
    // line; the Laptop amortization does.
    expect(detailed).toEqual([false, false, true])

    // Opening the routing editor gives a bare row a detail half of its own.
    toggleEditing('accounts')
    await tick()
    await fireEvent.click(screen.getAllByRole('button', { name: 'Edit routing' })[1]) // Rent

    expect(document.querySelectorAll('.allocation-row')[1].querySelector('.row-detail')).toBeTruthy()
  })

  test('leaving edit mode folds an open routing editor away', async () => {
    toggleEditing('accounts')
    render(AllocationScreen)

    await fireEvent.click(screen.getAllByRole('button', { name: 'Edit routing' })[1]) // Rent
    expect(screen.getByLabelText('Paid from')).toBeTruthy()

    toggleEditing('accounts')
    await tick()

    expect(screen.queryByLabelText('Paid from')).toBeNull()
  })
})
