import { describe, test, expect } from 'vitest'
import { requiredForAccount, projectedBalance, availableForAccount } from './accountMath'
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

    // 1200/11 + 900/2 — the saving window is period - 1, because an obligation
    // must be funded a month before it falls due.
    expect(requiredForAccount(vault, RESERVES, '2027-01')).toBe('559.09')
    expect(requiredForAccount(vault, MAIN, '2027-01')).toBe('545.45') // 6000/11
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
    expect(requiredForAccount(vault, RESERVES, '2027-01')).toBe('109.09')
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
    expect(required).toBe('109.09')
    expect(availableForAccount(vault, RESERVES, '2027-01')).toBe('990.91')
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
