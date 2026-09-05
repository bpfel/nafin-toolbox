import { render, screen, fireEvent, cleanup } from '@testing-library/svelte'
import { describe, test, expect, afterEach, beforeEach, vi } from 'vitest'
import { tick } from 'svelte'
import type { VaultEntry, VaultData } from '../../../lib/crypto/vault'

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

function entry(overrides: Partial<VaultEntry> & { id: string; name: string }): VaultEntry {
  return {
    type: 'expense',
    sortOrder: 0,
    archived: false,
    categoryId: 'g1',
    sourceAccountId: 'main',
    sinkAccountId: null,
    ...overrides,
  }
}

function makeVault(): VaultData {
  return {
    version: 6,
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
      categories: [{ id: 'g1', name: 'Everything', type: 'expense', sortOrder: 0 }],
      entries: [
        entry({
          id: 'salary',
          name: 'Salary',
          type: 'income',
          sortOrder: 0,
          sourceAccountId: null,
          sinkAccountId: 'main',
        }),
        entry({ id: 'rent', name: 'Rent', sortOrder: 1 }),
        entry({
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
        { entryId: 'salary', plannedAmount: '900.00' },
        { entryId: 'rent', plannedAmount: '500.00' },
        { entryId: 'laptop', plannedAmount: '100.00' },
      ],
      snapshots: [],
    },
  }
}

// Three expense entries across two named categories plus one whose category is
// gone. The categories are declared in the *opposite* order to their sortOrder, so
// a screen that grouped by encounter order would get this wrong.
function groupedVault(): VaultData {
  const vault = makeVault()
  vault.budget.categories = [
    { id: 'g-housing', name: 'Housing', type: 'expense', sortOrder: 20 },
    { id: 'g-fun', name: 'Fun', type: 'expense', sortOrder: 10 },
  ]
  vault.budget.entries = [
    entry({ id: 'rent', name: 'Rent', categoryId: 'g-housing', sortOrder: 0 }),
    entry({ id: 'games', name: 'Games', categoryId: 'g-fun', sortOrder: 1 }),
    // Its category was deleted — the row must survive that.
    entry({ id: 'orphan', name: 'Orphan', categoryId: 'g-deleted', sortOrder: 2 }),
  ]
  vault.budget.plan = [
    { entryId: 'rent', plannedAmount: '500.00' },
    { entryId: 'games', plannedAmount: '50.00' },
    { entryId: 'orphan', plannedAmount: '25.00' },
  ]
  return vault
}

function categoryHeaders() {
  return screen.getAllByTestId('allocation-category')
}

function categoryNames() {
  return categoryHeaders().map(el => el.querySelector('.category-name')!.textContent!.trim())
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

  test('an income entry is asked only where money lands, never where it comes from', async () => {
    render(AllocationScreen)

    const editButtons = screen.getAllByRole('button', { name: 'Edit routing' })
    await fireEvent.click(editButtons[0]) // Salary, the only income entry

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
    expect(testVault!.budget.entries.find(c => c.id === 'rent')!.sinkAccountId).toBe('main')
  })

  test('routing a set-aside back to spending takes its reserve with it', async () => {
    render(AllocationScreen)

    const editButtons = screen.getAllByRole('button', { name: 'Edit routing' })
    await fireEvent.click(editButtons[2]) // Laptop, a set-aside with an amortization
    expect(screen.getByLabelText('Saving towards')).toBeTruthy()

    await fireEvent.click(screen.getByLabelText('Leaves my accounts'))

    // A reserve has to accumulate somewhere, so a null sink cannot keep one.
    expect(screen.queryByLabelText('Saving towards')).toBeNull()
    expect(testVault!.budget.entries.find(c => c.id === 'laptop')!.reserve).toBeUndefined()
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

    test("categories follow the budget category's sortOrder, not the order they are met", () => {
      render(AllocationScreen)

      // Fun sorts at 10, Housing at 20, and a vanished category has no order at
      // all, so it lands last.
      expect(categoryNames()).toEqual(['Fun', 'Housing', 'Other'])
    })

    test('each category header carries its own planned subtotal', () => {
      render(AllocationScreen)

      const subtotals = categoryHeaders().map(el =>
        el.querySelector('.category-subtotal')!.textContent!.trim(),
      )
      expect(subtotals).toEqual(['50.00', '500.00', '25.00'])
    })

    test('collapsing a category hides only that category’s rows', async () => {
      render(AllocationScreen)

      expect(screen.queryByText('Games')).toBeTruthy()
      expect(screen.queryByText('Rent')).toBeTruthy()

      await fireEvent.click(categoryHeaders()[0]) // Fun

      expect(screen.queryByText('Games')).toBeNull()
      expect(screen.queryByText('Rent')).toBeTruthy()
      expect(screen.queryByText('Orphan')).toBeTruthy()
      // The header itself stays, subtotal and all — that is the point of it.
      expect(categoryNames()).toEqual(['Fun', 'Housing', 'Other'])
      expect(categoryHeaders()[0].getAttribute('aria-expanded')).toBe('false')

      // And it folds back open.
      await fireEvent.click(categoryHeaders()[0])
      expect(screen.queryByText('Games')).toBeTruthy()
    })

    test('an entry whose category was deleted still appears, under Other', () => {
      render(AllocationScreen)

      expect(screen.getByText('Orphan')).toBeTruthy()
      expect(categoryNames()).toContain('Other')
    })

    test('income and expenses stay separate sections, each grouped on its own', () => {
      // Two income categories, because a side with only one renders no header at
      // all — a lone category is not a grouping. One would leave nothing to
      // observe about income's ordering.
      testVault!.budget.categories.push(
        { id: 'g-pay', name: 'Pay', type: 'income', sortOrder: 5 },
        { id: 'g-side', name: 'Side work', type: 'income', sortOrder: 6 },
      )
      testVault!.budget.entries.push(
        entry({
          id: 'salary',
          name: 'Salary',
          type: 'income',
          categoryId: 'g-pay',
          sortOrder: 3,
          sourceAccountId: null,
          sinkAccountId: 'main',
        }),
        entry({
          id: 'freelance',
          name: 'Freelance',
          type: 'income',
          categoryId: 'g-side',
          sortOrder: 4,
          sourceAccountId: null,
          sinkAccountId: 'main',
        }),
      )

      render(AllocationScreen)

      // Income categories are listed inside "Money in", ahead of every expense
      // category, rather than merged into the expense ordering.
      expect(categoryNames()).toEqual(['Pay', 'Side work', 'Fun', 'Housing', 'Other'])
      expect(screen.getByText('Money in')).toBeTruthy()
    })

    test('a side with a single category renders no header for it', () => {
      // The default fixture has exactly one income entry, so income has one
      // category. Expenses have three and keep theirs.
      render(AllocationScreen)

      expect(categoryNames()).toEqual(['Fun', 'Housing', 'Other'])
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

  // Reading the plan is never gated: the flow lines, the figures and the category
  // headers are all there before anything is unlocked.
  test('the figures and the flow lines read fine read-only', () => {
    render(AllocationScreen)

    expect(screen.getByText('Rent')).toBeTruthy()
    expect(screen.getByText(/leaves your accounts/)).toBeTruthy()
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
