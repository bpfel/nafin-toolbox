import { describe, test, expect } from 'vitest'
import {
  allocationBreakdown,
  requiredForAccount,
  projectedBalance,
  availableForAccount,
} from './accountMath'
import type {
  ReserveDefinition,
  VaultAccount,
  VaultEntry,
  VaultData,
  VaultPlanEntry,
} from '../crypto/vault'

const MAIN = 'account-main'
const RESERVES = 'account-reserves'

function account(id: string, overrides: Partial<VaultAccount> = {}): VaultAccount {
  return {
    id,
    name: id,
    kind: 'transactional',
    currency: 'CHF',
    currentAmount: '0.00',
    lastCorrectedAt: '2026-01-15',
    ...overrides,
  }
}

function entry(id: string, overrides: Partial<VaultEntry> = {}): VaultEntry {
  return {
    id,
    name: id,
    type: 'expense',
    sortOrder: 10,
    archived: false,
    categoryId: 'category-1',
    sourceAccountId: MAIN,
    sinkAccountId: null,
    ...overrides,
  }
}

function reserve(overrides: Partial<ReserveDefinition> = {}): ReserveDefinition {
  return {
    targetAmount: '1200.00',
    periodMonths: 12,
    anchorMonth: '2026-12',
    ...overrides,
  }
}

function vaultWith(
  accounts: VaultAccount[],
  entries: VaultEntry[],
  plan: VaultPlanEntry[] = [],
): VaultData {
  return {
    version: 7,
    budget: { categories: [], entries, plan, snapshots: [] },
    accounts,
  }
}

describe('requiredForAccount', () => {
  test('sums only reserve items sinking into that account', () => {
    const vault = vaultWith(
      [account(MAIN), account(RESERVES)],
      [
        // Two reserves into Reserves: 1200/12 and 900/3, both one month into
        // their cycle at 2027-01 → 100.00 + 300.00.
        entry('tax', {
          sourceAccountId: MAIN,
          type: 'bill',
      sinkAccountId: RESERVES,
          reserve: reserve({ targetAmount: '1200.00', periodMonths: 12, anchorMonth: '2026-12' }),
        }),
        entry('insurance', {
          sourceAccountId: MAIN,
          type: 'bill',
      sinkAccountId: RESERVES,
          reserve: reserve({ targetAmount: '900.00', periodMonths: 3, anchorMonth: '2026-12' }),
        }),
        // Sinks somewhere else — must not count towards Reserves.
        entry('holiday', {
          sourceAccountId: RESERVES,
          type: 'bill',
          sinkAccountId: MAIN,
          reserve: reserve({ targetAmount: '6000.00', periodMonths: 12, anchorMonth: '2026-12' }),
        }),
        // No reserve at all.
        entry('groceries', { sourceAccountId: MAIN, sinkAccountId: null }),
      ],
    )

    // 2x1200/12 + 2x900/3 — one month after each rolls, so each holds the float
    // its payment left behind plus January's own contribution.
    expect(requiredForAccount(vault, RESERVES, '2027-01')).toBe('800.00')
    expect(requiredForAccount(vault, MAIN, '2027-01')).toBe('1000.00') // 2 x 6000/12
  })

  test('an archived entry with a reserve contributes nothing', () => {
    const live = entry('tax', {
      sourceAccountId: MAIN,
      type: 'bill',
      sinkAccountId: RESERVES,
      reserve: reserve(),
    })
    const archived = entry('old-tax', {
      archived: true,
      sourceAccountId: MAIN,
      type: 'bill',
      sinkAccountId: RESERVES,
      reserve: reserve({ targetAmount: '2400.00' }),
    })
    const vault = vaultWith([account(MAIN), account(RESERVES)], [live, archived])

    // Only the live 1200/12 reserve counts; archiving lowers the requirement.
    expect(requiredForAccount(vault, RESERVES, '2027-01')).toBe('200.00')
  })

  test('is 0.00 for an account with no reserves', () => {
    const vault = vaultWith([account(MAIN)], [entry('groceries')])
    expect(requiredForAccount(vault, MAIN, '2027-01')).toBe('0.00')
  })

  test('rejects an unknown account', () => {
    const vault = vaultWith([account(MAIN)], [])
    expect(() => requiredForAccount(vault, 'nope', '2027-01')).toThrow(/unknown account/)
  })
})

describe('allocationBreakdown', () => {
  // Three reserves into Reserves, deliberately out of size order in the vault.
  function vault() {
    return {
      version: 7 as const,
      budget: {
        categories: [
          { id: 'cat-tax', name: 'Taxes', side: 'expense' as const, sortOrder: 10 },
          { id: 'cat-car', name: 'Transport', side: 'expense' as const, sortOrder: 20 },
        ],
        entries: [
          entry('small', {
            name: 'Radio licence',
            type: 'bill',
            categoryId: 'cat-tax',
            sinkAccountId: RESERVES,
            reserve: reserve({ targetAmount: '360.00', periodMonths: 12, anchorMonth: '2026-12' }),
          }),
          entry('big', {
            name: 'Cantonal tax',
            type: 'bill',
            categoryId: 'cat-tax',
            sinkAccountId: RESERVES,
            reserve: reserve({ targetAmount: '6000.00', periodMonths: 12, anchorMonth: '2026-12' }),
          }),
          entry('car', {
            name: 'New car',
            type: 'purchase',
            categoryId: 'cat-car',
            sinkAccountId: RESERVES,
            reserve: reserve({ targetAmount: '12000.00', periodMonths: 24, anchorMonth: '2026-12' }),
          }),
        ],
        plan: [],
        snapshots: [],
      },
      accounts: [account(MAIN), account(RESERVES)],
    }
  }

  test('names every part, biggest first', () => {
    const parts = allocationBreakdown(vault(), RESERVES, '2027-01')

    expect(parts.map(p => p.entryName)).toEqual(['Cantonal tax', 'New car', 'Radio licence'])
    expect(parts.map(p => p.required)).toEqual(['1000.00', '500.00', '60.00'])
  })

  test('carries the heading each entry sits under', () => {
    const parts = allocationBreakdown(vault(), RESERVES, '2027-01')
    expect(parts.map(p => p.categoryName)).toEqual(['Taxes', 'Transport', 'Taxes'])
  })

  test('carries the target, so a part reads as progress rather than a bare figure', () => {
    const [biggest] = allocationBreakdown(vault(), RESERVES, '2027-01')
    expect(biggest.targetAmount).toBe('6000.00')
    expect(biggest.required).toBe('1000.00')
  })

  test('dates a bill and refuses to date a purchase', () => {
    const parts = allocationBreakdown(vault(), RESERVES, '2027-01')
    const byName = new Map(parts.map(p => [p.entryName, p]))

    expect(byName.get('Cantonal tax')?.nextDueMonth).toBe('2027-12')
    // A purchase anchors the start of its cycle, not a deadline.
    expect(byName.get('New car')?.nextDueMonth).toBeNull()
  })

  test('always sums to the figure on the card', () => {
    const v = vault()
    for (const month of ['2026-12', '2027-01', '2027-06', '2028-03']) {
      const summed = allocationBreakdown(v, RESERVES, month).reduce(
        (total, part) => total + Math.round(Number(part.required) * 100),
        0,
      )
      const shown = Math.round(Number(requiredForAccount(v, RESERVES, month)) * 100)
      // The total is defined as this sum, so the two cannot drift apart. This
      // is the invariant that lets the modal claim it shows the calculation.
      expect(summed).toBe(shown)
    }
  })

  test('leaves out the archived, the unreserved, and another account\'s', () => {
    const v = vault()
    v.budget.entries.push(
      entry('gone', {
        name: 'Old tax',
        type: 'bill',
        archived: true,
        sinkAccountId: RESERVES,
        reserve: reserve(),
      }),
      entry('groceries', { name: 'Groceries', sinkAccountId: null }),
      entry('elsewhere', {
        name: 'Holiday',
        type: 'bill',
        sinkAccountId: MAIN,
        reserve: reserve(),
      }),
    )

    const names = allocationBreakdown(v, RESERVES, '2027-01').map(p => p.entryName)
    expect(names).toEqual(['Cantonal tax', 'New car', 'Radio licence'])
  })

  test('is empty for an account nothing saves into', () => {
    expect(allocationBreakdown(vault(), MAIN, '2027-01')).toEqual([])
  })

  test('rejects an unknown account', () => {
    expect(() => allocationBreakdown(vault(), 'nope', '2027-01')).toThrow(/unknown account/)
  })
})

describe('projectedBalance', () => {
  const entries = [
    entry('salary', { type: 'income', sourceAccountId: null, sinkAccountId: MAIN }),
    entry('rent', { sourceAccountId: MAIN, sinkAccountId: null }),
    entry('tax-setaside', { type: 'savings', sourceAccountId: MAIN, sinkAccountId: RESERVES }),
  ]

  // The plan is a standing monthly flow: +6000 in, -1800 out, -200 set aside,
  // so Main nets +4000 every month.
  const plan: VaultPlanEntry[] = [
    { entryId: 'salary', plannedAmount: '6000.00' },
    { entryId: 'rent', plannedAmount: '1800.00' },
    { entryId: 'tax-setaside', plannedAmount: '200.00' },
  ]

  test('adds one month of the plan for every month after lastCorrectedAt', () => {
    const vault = vaultWith(
      [account(MAIN, { currentAmount: '1000.00', lastCorrectedAt: '2026-03-15' })],
      entries,
      plan,
    )

    // The anchor's own month is already accounted for by the correction.
    expect(projectedBalance(vault, MAIN, '2026-03')).toBe('1000.00')
    // 1000 + 1 x 4000
    expect(projectedBalance(vault, MAIN, '2026-04')).toBe('5000.00')
    // 1000 + 2 x 4000
    expect(projectedBalance(vault, MAIN, '2026-05')).toBe('9000.00')
  })

  test('a month before the anchor never runs the plan backwards', () => {
    const vault = vaultWith(
      [account(MAIN, { currentAmount: '1000.00', lastCorrectedAt: '2026-03-15' })],
      entries,
      plan,
    )

    // The projection runs forward from a correction; it does not reconstruct
    // the months before it.
    expect(projectedBalance(vault, MAIN, '2026-02')).toBe('1000.00')
    expect(projectedBalance(vault, MAIN, '2025-12')).toBe('1000.00')
  })

  test('every elapsed month counts, with no gaps to fall through', () => {
    // The old period-based projection summed only the months that had a period
    // row, so a gap understated the balance. A standing plan has no gaps: eleven
    // months elapsed means eleven months of flow.
    const vault = vaultWith(
      [account(MAIN, { currentAmount: '0.00', lastCorrectedAt: '2026-01-31' })],
      [entry('salary', { type: 'income', sourceAccountId: null, sinkAccountId: MAIN })],
      [{ entryId: 'salary', plannedAmount: '1000.00' }],
    )

    expect(projectedBalance(vault, MAIN, '2026-12')).toBe('11000.00')
  })

  test('credits the sink account of a set-aside', () => {
    const vault = vaultWith(
      [
        account(MAIN, { currentAmount: '0.00', lastCorrectedAt: '2026-01-01' }),
        account(RESERVES, { currentAmount: '50.00', lastCorrectedAt: '2026-01-01' }),
      ],
      entries,
      [{ entryId: 'tax-setaside', plannedAmount: '200.00' }],
    )

    expect(projectedBalance(vault, RESERVES, '2026-02')).toBe('250.00')
    expect(projectedBalance(vault, MAIN, '2026-02')).toBe('-200.00')
  })

  test('a set-aside into its own account nets to nothing', () => {
    const vault = vaultWith(
      [account(MAIN, { currentAmount: '100.00', lastCorrectedAt: '2026-01-01' })],
      [entry('circular', { type: 'savings', sourceAccountId: MAIN, sinkAccountId: MAIN })],
      [{ entryId: 'circular', plannedAmount: '75.00' }],
    )

    expect(projectedBalance(vault, MAIN, '2026-02')).toBe('100.00')
    // Still nothing after a year of it.
    expect(projectedBalance(vault, MAIN, '2027-01')).toBe('100.00')
  })

  test('ignores plan lines whose entry no longer exists', () => {
    const vault = vaultWith(
      [account(MAIN, { currentAmount: '100.00', lastCorrectedAt: '2026-01-01' })],
      entries,
      [{ entryId: 'deleted', plannedAmount: '500.00' }],
    )

    expect(projectedBalance(vault, MAIN, '2026-02')).toBe('100.00')
  })

  test('is idempotent and does not mutate the vault', () => {
    const vault = vaultWith(
      [account(MAIN, { currentAmount: '1000.00', lastCorrectedAt: '2026-01-31' }), account(RESERVES)],
      entries,
      [
        { entryId: 'salary', plannedAmount: '6000.00' },
        { entryId: 'rent', plannedAmount: '1800.00' },
      ],
    )
    const before = structuredClone(vault)

    const first = projectedBalance(vault, MAIN, '2026-03')
    const second = projectedBalance(vault, MAIN, '2026-03')
    const third = projectedBalance(vault, MAIN, '2026-03')

    // 1000 + 2 x (6000 - 1800)
    expect(first).toBe('9400.00')
    expect(second).toBe(first)
    expect(third).toBe(first)
    expect(vault).toEqual(before)
  })

  test('months are zero-padded, so December is not confused with February', () => {
    const vault = vaultWith(
      [account(MAIN, { currentAmount: '0.00', lastCorrectedAt: '2026-11-30' })],
      entries,
      [{ entryId: 'salary', plannedAmount: '500.00' }],
    )

    expect(projectedBalance(vault, MAIN, '2026-12')).toBe('500.00')
    expect(projectedBalance(vault, MAIN, '2026-11')).toBe('0.00')
  })
})

describe('availableForAccount', () => {
  test('equals projectedBalance minus requiredForAccount', () => {
    const vault = vaultWith(
      [
        account(MAIN, { currentAmount: '0.00', lastCorrectedAt: '2026-12-01' }),
        account(RESERVES, { currentAmount: '1000.00', lastCorrectedAt: '2026-12-01' }),
      ],
      [
        entry('tax-setaside', {
          sourceAccountId: MAIN,
          type: 'bill',
      sinkAccountId: RESERVES,
          reserve: reserve({ targetAmount: '1200.00', periodMonths: 12, anchorMonth: '2026-12' }),
        }),
      ],
      [{ entryId: 'tax-setaside', plannedAmount: '100.00' }],
    )

    const projected = projectedBalance(vault, RESERVES, '2027-01')
    const required = requiredForAccount(vault, RESERVES, '2027-01')
    expect(projected).toBe('1100.00')
    expect(required).toBe('200.00')
    expect(availableForAccount(vault, RESERVES, '2027-01')).toBe('900.00')
    expect(Number(availableForAccount(vault, RESERVES, '2027-01')))
      .toBeCloseTo(Number(projected) - Number(required), 2)
  })

  test('goes negative when the account is under-funded', () => {
    const vault = vaultWith(
      [account(RESERVES, { currentAmount: '100.00', lastCorrectedAt: '2026-12-01' })],
      [
        entry('tax-setaside', {
          type: 'bill',
          sourceAccountId: MAIN,
          sinkAccountId: RESERVES,
          // Due now, so the full 1200.00 is required against a 100.00 balance.
          reserve: reserve({ targetAmount: '1200.00', periodMonths: 12, anchorMonth: '2026-12' }),
        }),
      ],
    )

    expect(projectedBalance(vault, RESERVES, '2026-12')).toBe('100.00')
    expect(requiredForAccount(vault, RESERVES, '2026-12')).toBe('1200.00')
    expect(availableForAccount(vault, RESERVES, '2026-12')).toBe('-1100.00')
  })
})

describe('the monthly figure on a part', () => {
  // Both kinds divide by the whole period: the lead moves when a bill's ramp
  // runs, not how steep it is. Kept on the part rather than left to the caller
  // so the figure shown and the figure filled cannot disagree.
  function breakdownOf(e: VaultEntry) {
    return allocationBreakdown(
      vaultWith([account(MAIN), account(RESERVES, { kind: 'reserves' })], [e]),
      RESERVES,
      '2026-12',
    )[0]
  }

  test('a bill divides by the whole period, like everything else', () => {
    const part = breakdownOf(
      entry('tax', {
        type: 'bill',
        sinkAccountId: RESERVES,
        reserve: reserve({ targetAmount: '6000.00', periodMonths: 12 }),
      }),
    )

    // 6000 over 12 months. The lead is paid for by a float, not by a steeper
    // monthly figure.
    expect(part.monthlyAmount).toBe('500.00')
    expect(part.targetAmount).toBe('6000.00')
  })

  test('a purchase divides by the whole period', () => {
    const part = breakdownOf(
      entry('car', {
        type: 'purchase',
        sinkAccountId: RESERVES,
        reserve: reserve({ targetAmount: '12000.00', periodMonths: 24 }),
      }),
    )

    expect(part.monthlyAmount).toBe('500.00')
  })

  test('a monthly bill is its own full target every month', () => {
    const part = breakdownOf(
      entry('rent', {
        type: 'bill',
        sinkAccountId: RESERVES,
        reserve: reserve({ targetAmount: '1350.00', periodMonths: 1 }),
      }),
    )

    expect(part.monthlyAmount).toBe('1350.00')
  })
})
