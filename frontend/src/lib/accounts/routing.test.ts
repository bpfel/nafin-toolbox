import { describe, test, expect } from 'vitest'
import {
  flowKindOf,
  isLegalRouting,
  isLegalCategoryRouting,
  defaultRouting,
  primaryAccountId,
} from './routing'
import { createEmptyVault, type VaultAccount, type VaultCategory, type ReserveDefinition } from '../crypto/vault'

const A = 'account-a'
const B = 'account-b'

function category(overrides: Partial<VaultCategory> = {}): VaultCategory {
  return {
    id: 'cat-1',
    name: 'Test',
    type: 'expense',
    sortOrder: 10,
    archived: false,
    groupId: 'group-1',
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
  kind: 'obligation',
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

  test('expense + (A, B) is legal — set-aside into another account', () => {
    expect(isLegalRouting('expense', A, B)).toBe(true)
  })

  test('expense + (A, A) is legal — set-aside within the same account', () => {
    expect(isLegalRouting('expense', A, A)).toBe(true)
  })

  test('(null, null) is illegal for both types — it cannot occur', () => {
    expect(isLegalRouting('income', null, null)).toBe(false)
    expect(isLegalRouting('expense', null, null)).toBe(false)
  })
})

describe('flowKindOf', () => {
  test('source non-null and sink null is spending', () => {
    expect(flowKindOf(category({ sourceAccountId: A, sinkAccountId: null }))).toBe('spending')
  })

  test('source null and sink non-null is income', () => {
    expect(flowKindOf(category({ type: 'income', sourceAccountId: null, sinkAccountId: A }))).toBe('income')
  })

  test('both non-null and distinct is setaside', () => {
    expect(flowKindOf(category({ sourceAccountId: A, sinkAccountId: B }))).toBe('setaside')
  })

  test('(A, A) classifies as setaside', () => {
    expect(flowKindOf(category({ sourceAccountId: A, sinkAccountId: A }))).toBe('setaside')
  })

  test('throws when both endpoints are null', () => {
    expect(() => flowKindOf(category({ sourceAccountId: null, sinkAccountId: null }))).toThrow()
  })
})

describe('isLegalCategoryRouting', () => {
  test('accepts a legal routing without a reserve', () => {
    expect(isLegalCategoryRouting(category({ sourceAccountId: A, sinkAccountId: null }))).toBe(true)
  })

  test('rejects an illegal routing without a reserve', () => {
    expect(isLegalCategoryRouting(category({ type: 'income', sourceAccountId: A, sinkAccountId: B }))).toBe(false)
  })

  test('accepts a reserve on an expense with a non-null sink', () => {
    expect(isLegalCategoryRouting(category({ sourceAccountId: A, sinkAccountId: B, reserve }))).toBe(true)
  })

  test('accepts a reserve on an (A, A) set-aside', () => {
    expect(isLegalCategoryRouting(category({ sourceAccountId: A, sinkAccountId: A, reserve }))).toBe(true)
  })

  test('rejects a reserve when the sink is null', () => {
    expect(isLegalCategoryRouting(category({ sourceAccountId: A, sinkAccountId: null, reserve }))).toBe(false)
  })

  test('rejects a reserve on an income category', () => {
    // (null, A) is a legal income routing, but a reserve may never ride on income.
    expect(isLegalCategoryRouting(category({ type: 'income', sourceAccountId: null, sinkAccountId: A, reserve }))).toBe(false)
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

  test('income defaults classify as income, expense defaults as spending', () => {
    const income = defaultRouting('income', A)
    const expense = defaultRouting('expense', A)

    expect(flowKindOf(category({ type: 'income', ...income }))).toBe('income')
    expect(flowKindOf(category({ type: 'expense', ...expense }))).toBe('spending')
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
