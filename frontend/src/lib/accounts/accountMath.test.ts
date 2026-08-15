import { describe, test, expect } from 'vitest'
import { requiredForAccount, projectedBalance, availableForAccount } from './accountMath'
import type {
  ReserveDefinition,
  VaultAccount,
  VaultCategory,
  VaultData,
  VaultPeriod,
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

function category(id: string, overrides: Partial<VaultCategory> = {}): VaultCategory {
  return {
    id,
    name: id,
    type: 'expense',
    sortOrder: 10,
    archived: false,
    groupId: 'group-1',
    fixed: false,
    sourceAccountId: MAIN,
    sinkAccountId: null,
    ...overrides,
  }
}

function reserve(overrides: Partial<ReserveDefinition> = {}): ReserveDefinition {
  return {
    kind: 'obligation',
    targetAmount: '1200.00',
    periodMonths: 12,
    anchorMonth: '2026-12',
    ...overrides,
  }
}

function period(
  year: number,
  month: number,
  entries: { categoryId: string; plannedAmount: string }[],
): VaultPeriod {
  return {
    year,
    month,
    notes: '',
    entries: entries.map(e => ({ ...e, actualAmount: '0.00' })),
  }
}

function vaultWith(
  accounts: VaultAccount[],
  categories: VaultCategory[],
  periods: VaultPeriod[] = [],
): VaultData {
  return {
    version: 2,
    budget: { categoryGroups: [], categories, periods },
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
        category('tax', {
          sourceAccountId: MAIN,
          sinkAccountId: RESERVES,
          reserve: reserve({ targetAmount: '1200.00', periodMonths: 12, anchorMonth: '2026-12' }),
        }),
        category('insurance', {
          sourceAccountId: MAIN,
          sinkAccountId: RESERVES,
          reserve: reserve({ targetAmount: '900.00', periodMonths: 3, anchorMonth: '2026-12' }),
        }),
        // Sinks somewhere else — must not count towards Reserves.
        category('holiday', {
          sourceAccountId: RESERVES,
          sinkAccountId: MAIN,
          reserve: reserve({ targetAmount: '6000.00', periodMonths: 12, anchorMonth: '2026-12' }),
        }),
        // No reserve at all.
        category('groceries', { sourceAccountId: MAIN, sinkAccountId: null }),
      ],
    )

    expect(requiredForAccount(vault, RESERVES, '2027-01')).toBe('400.00')
    expect(requiredForAccount(vault, MAIN, '2027-01')).toBe('500.00')
  })

  test('an archived category with a reserve contributes nothing', () => {
    const live = category('tax', {
      sourceAccountId: MAIN,
      sinkAccountId: RESERVES,
      reserve: reserve(),
    })
    const archived = category('old-tax', {
      archived: true,
      sourceAccountId: MAIN,
      sinkAccountId: RESERVES,
      reserve: reserve({ targetAmount: '2400.00' }),
    })
    const vault = vaultWith([account(MAIN), account(RESERVES)], [live, archived])

    // Only the live 1200/12 reserve counts; archiving lowers the requirement.
    expect(requiredForAccount(vault, RESERVES, '2027-01')).toBe('100.00')
  })

  test('is 0.00 for an account with no reserves', () => {
    const vault = vaultWith([account(MAIN)], [category('groceries')])
    expect(requiredForAccount(vault, MAIN, '2027-01')).toBe('0.00')
  })

  test('rejects an unknown account', () => {
    const vault = vaultWith([account(MAIN)], [])
    expect(() => requiredForAccount(vault, 'nope', '2027-01')).toThrow(/unknown account/)
  })
})

describe('projectedBalance', () => {
  const categories = [
    category('salary', { type: 'income', sourceAccountId: null, sinkAccountId: MAIN }),
    category('rent', { sourceAccountId: MAIN, sinkAccountId: null }),
    category('tax-setaside', { sourceAccountId: MAIN, sinkAccountId: RESERVES }),
  ]

  test('ignores months at or before lastCorrectedAt and includes months after it', () => {
    const vault = vaultWith(
      [account(MAIN, { currentAmount: '1000.00', lastCorrectedAt: '2026-03-15' })],
      categories,
      [
        // Before the anchor — must be ignored.
        period(2026, 2, [{ categoryId: 'salary', plannedAmount: '5000.00' }]),
        // The anchor's own month — the correction already accounts for it.
        period(2026, 3, [{ categoryId: 'salary', plannedAmount: '5000.00' }]),
        // After the anchor, up to and including currentMonth — counted.
        period(2026, 4, [
          { categoryId: 'salary', plannedAmount: '6000.00' },
          { categoryId: 'rent', plannedAmount: '1800.00' },
          { categoryId: 'tax-setaside', plannedAmount: '200.00' },
        ]),
        period(2026, 5, [{ categoryId: 'salary', plannedAmount: '6000.00' }]),
        // After currentMonth — not yet counted.
        period(2026, 6, [{ categoryId: 'salary', plannedAmount: '9999.00' }]),
      ],
    )

    // 1000 + (6000 - 1800 - 200) + 6000 = 11000
    expect(projectedBalance(vault, MAIN, '2026-05')).toBe('11000.00')
    // Asking about the anchor month itself yields the anchor untouched.
    expect(projectedBalance(vault, MAIN, '2026-03')).toBe('1000.00')
  })

  test('credits the sink account of a set-aside', () => {
    const vault = vaultWith(
      [
        account(MAIN, { currentAmount: '0.00', lastCorrectedAt: '2026-01-01' }),
        account(RESERVES, { currentAmount: '50.00', lastCorrectedAt: '2026-01-01' }),
      ],
      categories,
      [period(2026, 2, [{ categoryId: 'tax-setaside', plannedAmount: '200.00' }])],
    )

    expect(projectedBalance(vault, RESERVES, '2026-02')).toBe('250.00')
    expect(projectedBalance(vault, MAIN, '2026-02')).toBe('-200.00')
  })

  test('a set-aside into its own account nets to nothing', () => {
    const vault = vaultWith(
      [account(MAIN, { currentAmount: '100.00', lastCorrectedAt: '2026-01-01' })],
      [category('circular', { sourceAccountId: MAIN, sinkAccountId: MAIN })],
      [period(2026, 2, [{ categoryId: 'circular', plannedAmount: '75.00' }])],
    )

    expect(projectedBalance(vault, MAIN, '2026-02')).toBe('100.00')
  })

  test('ignores entries whose category no longer exists', () => {
    const vault = vaultWith(
      [account(MAIN, { currentAmount: '100.00', lastCorrectedAt: '2026-01-01' })],
      categories,
      [period(2026, 2, [{ categoryId: 'deleted', plannedAmount: '500.00' }])],
    )

    expect(projectedBalance(vault, MAIN, '2026-02')).toBe('100.00')
  })

  test('is idempotent and does not mutate the vault', () => {
    const vault = vaultWith(
      [account(MAIN, { currentAmount: '1000.00', lastCorrectedAt: '2026-01-31' }), account(RESERVES)],
      categories,
      [
        period(2026, 2, [
          { categoryId: 'salary', plannedAmount: '6000.00' },
          { categoryId: 'rent', plannedAmount: '1800.00' },
        ]),
        period(2026, 3, [{ categoryId: 'tax-setaside', plannedAmount: '200.00' }]),
      ],
    )
    const before = structuredClone(vault)

    const first = projectedBalance(vault, MAIN, '2026-03')
    const second = projectedBalance(vault, MAIN, '2026-03')
    const third = projectedBalance(vault, MAIN, '2026-03')

    expect(first).toBe('5000.00')
    expect(second).toBe(first)
    expect(third).toBe(first)
    expect(vault).toEqual(before)
  })

  test('period months are zero-padded, so December is not confused with February', () => {
    const vault = vaultWith(
      [account(MAIN, { currentAmount: '0.00', lastCorrectedAt: '2026-11-30' })],
      categories,
      [period(2026, 12, [{ categoryId: 'salary', plannedAmount: '500.00' }])],
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
        category('tax-setaside', {
          sourceAccountId: MAIN,
          sinkAccountId: RESERVES,
          reserve: reserve({ targetAmount: '1200.00', periodMonths: 12, anchorMonth: '2026-12' }),
        }),
      ],
      [period(2027, 1, [{ categoryId: 'tax-setaside', plannedAmount: '100.00' }])],
    )

    const projected = projectedBalance(vault, RESERVES, '2027-01')
    const required = requiredForAccount(vault, RESERVES, '2027-01')
    expect(projected).toBe('1100.00')
    expect(required).toBe('100.00')
    expect(availableForAccount(vault, RESERVES, '2027-01')).toBe('1000.00')
    expect(Number(availableForAccount(vault, RESERVES, '2027-01')))
      .toBeCloseTo(Number(projected) - Number(required), 2)
  })

  test('goes negative when the account is under-funded', () => {
    const vault = vaultWith(
      [account(RESERVES, { currentAmount: '100.00', lastCorrectedAt: '2026-12-01' })],
      [
        category('tax-setaside', {
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
