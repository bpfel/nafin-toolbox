import { describe, test, expect } from 'vitest'
import {
  isLegalRouting,
  isLegalEntryRouting,
  defaultRouting,
  primaryAccountId,
} from './routing'
import { createEmptyVault, type VaultAccount, type VaultEntry, type ReserveDefinition } from '../crypto/vault'

const A = 'account-a'
const B = 'account-b'

function entry(overrides: Partial<VaultEntry> = {}): VaultEntry {
  return {
    id: 'cat-1',
    name: 'Test',
    type: 'expense',
    sortOrder: 10,
    archived: false,
    categoryId: 'category-1',
    sourceAccountId: A,
    sinkAccountId: null,
    ...overrides,
  }
}

function account(id: string, name: string): VaultAccount {
  return {
    id,
    name,
    kind: 'transactional',
    currency: 'CHF',
    currentAmount: '0.00',
    lastCorrectedAt: '2026-01-01',
  }
}

const reserve: ReserveDefinition = {
  targetAmount: '1200.00',
  periodMonths: 12,
  anchorMonth: '2026-01',
}

describe('isLegalRouting — the validity matrix', () => {
  test('income + (null, A) is legal — canonical income', () => {
    expect(isLegalRouting('income', null, A)).toBe(true)
  })

  test('income + (A, null) is illegal — typed income but money leaves', () => {
    expect(isLegalRouting('income', A, null)).toBe(false)
  })

  test('income + (A, B) is illegal — internal move counted as new income', () => {
    expect(isLegalRouting('income', A, B)).toBe(false)
  })

  test('income + (A, A) is illegal — nothing moves, nothing earned', () => {
    expect(isLegalRouting('income', A, A)).toBe(false)
  })

  test('expense + (null, A) is illegal — typed expense but money arrives', () => {
    expect(isLegalRouting('expense', null, A)).toBe(false)
  })

  test('expense + (A, null) is legal — canonical expense, real outflow', () => {
    expect(isLegalRouting('expense', A, null)).toBe(true)
  })

  test('expense + (A, B) is illegal — money that stays is not an expense', () => {
    // This was legal until v7, and was how a set-aside was expressed: an expense
    // routed to an account rather than out of one. The three types that hold
    // money say it directly now, so an expense with somewhere to land is a
    // contradiction rather than a convention.
    expect(isLegalRouting('expense', A, B)).toBe(false)
  })

  test('expense + (A, A) is illegal — nothing left, so nothing was spent', () => {
    expect(isLegalRouting('expense', A, A)).toBe(false)
  })

  test('the three that hold money need somewhere to hold it', () => {
    for (const type of ['savings', 'bill', 'purchase'] as const) {
      expect(isLegalRouting(type, A, B)).toBe(true)
      expect(isLegalRouting(type, A, A)).toBe(true)
      expect(isLegalRouting(type, A, null)).toBe(false)
      expect(isLegalRouting(type, null, A)).toBe(false)
    }
  })

  test('(null, null) is illegal for both types — it cannot occur', () => {
    expect(isLegalRouting('income', null, null)).toBe(false)
    expect(isLegalRouting('expense', null, null)).toBe(false)
  })
})

// Since v7 this reads the type rather than inferring from the endpoints, which
// is why there is nothing here about (null, null) any more: it used to be the
// one case the inference could not classify, and the type has an answer for
// every entry.
describe('isLegalEntryRouting', () => {
  test('accepts a legal routing without a reserve', () => {
    expect(isLegalEntryRouting(entry({ sourceAccountId: A, sinkAccountId: null }))).toBe(true)
  })

  test('rejects an illegal routing without a reserve', () => {
    expect(isLegalEntryRouting(entry({ type: 'income', sourceAccountId: A, sinkAccountId: B }))).toBe(false)
  })

  test('accepts a reserve on a bill and on a purchase', () => {
    for (const type of ['bill', 'purchase'] as const) {
      expect(isLegalEntryRouting(entry({ type, sourceAccountId: A, sinkAccountId: B, reserve }))).toBe(true)
    }
  })

  test('accepts a reserve held inside a single account', () => {
    expect(isLegalEntryRouting(entry({ type: 'bill', sourceAccountId: A, sinkAccountId: A, reserve }))).toBe(true)
  })

  test('rejects a reserve on savings, which has no target to reach', () => {
    // The difference between savings and the other two is exactly this: a
    // target. Carrying one without being either is a contradiction.
    expect(isLegalEntryRouting(entry({ type: 'savings', sourceAccountId: A, sinkAccountId: B, reserve }))).toBe(false)
  })

  test('rejects a reserve on an expense — it is gone, not being saved for', () => {
    expect(isLegalEntryRouting(entry({ type: 'expense', sourceAccountId: A, sinkAccountId: null, reserve }))).toBe(false)
  })

  test('rejects a reserve on an income entry', () => {
    expect(isLegalEntryRouting(entry({ type: 'income', sourceAccountId: null, sinkAccountId: A, reserve }))).toBe(false)
  })
})

describe('defaultRouting', () => {
  test('income defaults to source null, sink primary account', () => {
    expect(defaultRouting('income', A)).toEqual({ sourceAccountId: null, sinkAccountId: A })
  })

  test('expense defaults to source primary account, sink null', () => {
    expect(defaultRouting('expense', A)).toEqual({ sourceAccountId: A, sinkAccountId: null })
  })

  test('returns a legal pair for both types', () => {
    for (const type of ['income', 'expense'] as const) {
      const routing = defaultRouting(type, A)
      expect(isLegalRouting(type, routing.sourceAccountId, routing.sinkAccountId)).toBe(true)
    }
  })

  test('the defaults are legal for the type that asked for them', () => {
    // What `flowKindOf` used to assert, without the second vocabulary: the
    // shape a type is born with is one its own rules accept.
    for (const type of ['income', 'expense', 'savings', 'bill', 'purchase'] as const) {
      const routing = defaultRouting(type, A)
      expect(isLegalRouting(type, routing.sourceAccountId, routing.sinkAccountId)).toBe(true)
    }
  })
})

describe('primaryAccountId', () => {
  test('returns the id of the first account', () => {
    const vault = createEmptyVault()

    expect(primaryAccountId(vault)).toBe(vault.accounts[0].id)
  })

  test('a fresh vault always has a primary account', () => {
    const vault = createEmptyVault()

    expect(primaryAccountId(vault)).toBeTruthy()
  })

  test('returns the first account, not any later one', () => {
    const vault = createEmptyVault()
    vault.accounts = [account(A, 'First'), account(B, 'Second')]

    expect(primaryAccountId(vault)).toBe(A)
  })

  test('throws a clear error when the vault has no accounts', () => {
    const vault = createEmptyVault()
    vault.accounts = []

    expect(() => primaryAccountId(vault)).toThrow(/no accounts/)
  })
})
