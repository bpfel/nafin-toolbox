import { describe, test, expect } from 'vitest'
import {
  createAccount,
  renameAccount,
  deleteAccount,
  correctBalance,
  reorderAccounts,
} from './accountsEngine'
import { isLegalCategoryRouting } from './routing'
import { createEmptyVault, type VaultCategory, type VaultData, type ReserveDefinition } from '../crypto/vault'

function addCategory(vault: VaultData, overrides: Partial<VaultCategory> = {}): VaultCategory {
  const category: VaultCategory = {
    id: `cat-${vault.budget.categories.length + 1}`,
    name: 'Test',
    type: 'expense',
    sortOrder: 10,
    archived: false,
    groupId: 'group-1',
    sourceAccountId: null,
    sinkAccountId: null,
    ...overrides,
  }
  vault.budget.categories.push(category)
  return category
}

function snapshot(vault: VaultData): string {
  return JSON.stringify(vault)
}

const reserve: ReserveDefinition = {
  kind: 'obligation',
  targetAmount: '1200.00',
  periodMonths: 12,
  anchorMonth: '2026-01',
}

describe('createAccount', () => {
  test('applies the documented defaults', () => {
    const vault = createEmptyVault()

    const account = createAccount(vault, { name: 'Savings' })

    expect(account.name).toBe('Savings')
    expect(account.kind).toBe('transactional')
    expect(account.currency).toBe('CHF')
    expect(account.currentAmount).toBe('0.00')
    expect(account.lastCorrectedAt).toBe(new Date().toISOString().slice(0, 10))
  })

  test('generates a distinct id per account', () => {
    const vault = createEmptyVault()

    const first = createAccount(vault, { name: 'One' })
    const second = createAccount(vault, { name: 'Two' })

    expect(first.id).toBeTruthy()
    expect(second.id).not.toBe(first.id)
    expect(first.id).not.toBe(vault.accounts[0].id)
  })

  test('honours overrides of every default', () => {
    const vault = createEmptyVault()

    const account = createAccount(vault, {
      id: 'fixed-id',
      name: 'Pillar 3a',
      kind: 'retirement_3a',
      currentAmount: '7056.00',
      lastCorrectedAt: '2026-01-31',
    })

    expect(account.id).toBe('fixed-id')
    expect(account.kind).toBe('retirement_3a')
    expect(account.currentAmount).toBe('7056.00')
    expect(account.lastCorrectedAt).toBe('2026-01-31')
  })

  test('carries optional QR fields through when given', () => {
    const vault = createEmptyVault()

    const account = createAccount(vault, {
      name: 'Salary',
      bankName: 'Example Bank',
      iban: 'CH9300762011623852957',
      ibanKind: 'iban',
    })

    expect(account.bankName).toBe('Example Bank')
    expect(account.iban).toBe('CH9300762011623852957')
    expect(account.ibanKind).toBe('iban')
  })

  test('appends to vault.accounts, leaving the existing ones in place', () => {
    const vault = createEmptyVault()
    const mainId = vault.accounts[0].id

    const account = createAccount(vault, { name: 'Reserves', kind: 'reserves' })

    expect(vault.accounts).toHaveLength(2)
    expect(vault.accounts[0].id).toBe(mainId)
    expect(vault.accounts[1]).toBe(account)
  })
})

describe('renameAccount', () => {
  test('renames the named account only', () => {
    const vault = createEmptyVault()
    const other = createAccount(vault, { name: 'Savings' })

    renameAccount(vault, other.id, 'Holiday fund')

    expect(other.name).toBe('Holiday fund')
    expect(vault.accounts[0].name).toBe('Main')
  })

  test('throws on a missing id and leaves the vault unchanged', () => {
    const vault = createEmptyVault()
    createAccount(vault, { name: 'Savings' })
    const before = snapshot(vault)

    expect(() => renameAccount(vault, 'no-such-account', 'Nope')).toThrow(/not found/)
    expect(snapshot(vault)).toBe(before)
  })
})

describe('correctBalance', () => {
  test('sets currentAmount and lastCorrectedAt together', () => {
    const vault = createEmptyVault()
    const account = vault.accounts[0]

    correctBalance(vault, account.id, '1234.50', '2026-03-31')

    expect(account.currentAmount).toBe('1234.50')
    expect(account.lastCorrectedAt).toBe('2026-03-31')
  })

  test('a second correction moves the pair again', () => {
    const vault = createEmptyVault()
    const account = vault.accounts[0]

    correctBalance(vault, account.id, '1234.50', '2026-03-31')
    correctBalance(vault, account.id, '980.00', '2026-04-30')

    expect(account.currentAmount).toBe('980.00')
    expect(account.lastCorrectedAt).toBe('2026-04-30')
  })

  test('touches no other account', () => {
    const vault = createEmptyVault()
    const other = createAccount(vault, { name: 'Savings' })

    correctBalance(vault, vault.accounts[0].id, '500.00', '2026-03-31')

    expect(other.currentAmount).toBe('0.00')
  })

  test('throws on a missing id and leaves the vault unchanged', () => {
    const vault = createEmptyVault()
    const before = snapshot(vault)

    expect(() => correctBalance(vault, 'no-such-account', '10.00', '2026-03-31')).toThrow(/not found/)
    expect(snapshot(vault)).toBe(before)
  })
})

describe('reorderAccounts', () => {
  // Four accounts named for their starting position, so an expectation reads
  // as the order it describes.
  function fourAccounts(vault: VaultData) {
    const first = vault.accounts[0]
    return [
      first,
      createAccount(vault, { name: 'Second' }),
      createAccount(vault, { name: 'Third' }),
      createAccount(vault, { name: 'Fourth' }),
    ]
  }

  test('a full id list produces exactly that order', () => {
    const vault = createEmptyVault()
    const [a, b, c, d] = fourAccounts(vault)

    reorderAccounts(vault, [d.id, b.id, a.id, c.id])

    expect(vault.accounts.map(x => x.id)).toEqual([d.id, b.id, a.id, c.id])
  })

  test('reversing then restoring returns the original order', () => {
    const vault = createEmptyVault()
    const [a, b, c, d] = fourAccounts(vault)

    reorderAccounts(vault, [d.id, c.id, b.id, a.id])
    reorderAccounts(vault, [a.id, b.id, c.id, d.id])

    expect(vault.accounts.map(x => x.id)).toEqual([a.id, b.id, c.id, d.id])
  })

  test('omitted accounts are kept, appended in their original relative order', () => {
    const vault = createEmptyVault()
    const [a, b, c, d] = fourAccounts(vault)

    // Only two ids arrive — a stale or filtered read. b and d must survive,
    // and b (originally before d) must still come before it.
    reorderAccounts(vault, [c.id, a.id])

    expect(vault.accounts.map(x => x.id)).toEqual([c.id, a.id, b.id, d.id])
  })

  test('an empty id list is a no-op rather than an erasure', () => {
    const vault = createEmptyVault()
    const [a, b, c, d] = fourAccounts(vault)

    reorderAccounts(vault, [])

    expect(vault.accounts.map(x => x.id)).toEqual([a.id, b.id, c.id, d.id])
  })

  test('unknown ids are ignored and nothing is lost', () => {
    const vault = createEmptyVault()
    const [a, b, c, d] = fourAccounts(vault)

    reorderAccounts(vault, ['ghost-1', c.id, 'ghost-2', a.id, 'ghost-3', d.id, b.id])

    expect(vault.accounts.map(x => x.id)).toEqual([c.id, a.id, d.id, b.id])
  })

  test('a repeated id places the account once, keeping every other account', () => {
    const vault = createEmptyVault()
    const [a, b, c, d] = fourAccounts(vault)

    reorderAccounts(vault, [b.id, b.id, a.id])

    expect(vault.accounts.map(x => x.id)).toEqual([b.id, a.id, c.id, d.id])
  })

  test('the account count never changes, whatever the id list', () => {
    const lists: (string[] | 'full' | 'partial')[] = ['full', 'partial', [], ['nope'], ['nope', 'nope']]

    for (const spec of lists) {
      const vault = createEmptyVault()
      const [a, b, c, d] = fourAccounts(vault)
      const ids =
        spec === 'full' ? [d.id, c.id, b.id, a.id] : spec === 'partial' ? [c.id] : spec

      reorderAccounts(vault, ids)

      expect(vault.accounts).toHaveLength(4)
      expect(new Set(vault.accounts.map(x => x.id))).toEqual(new Set([a.id, b.id, c.id, d.id]))
    }
  })

  test('reordering disturbs no account field and keeps object identity', () => {
    const vault = createEmptyVault()
    const [a, b, c, d] = fourAccounts(vault)
    correctBalance(vault, b.id, '1234.50', '2026-03-31')
    b.iban = 'CH9300762011623852957'
    b.bankName = 'Example Bank'
    const before = JSON.stringify(vault.accounts.map(x => ({ ...x })).sort((x, y) => x.id < y.id ? -1 : 1))

    reorderAccounts(vault, [d.id, a.id])

    const after = JSON.stringify(vault.accounts.map(x => ({ ...x })).sort((x, y) => x.id < y.id ? -1 : 1))
    expect(after).toBe(before)
    // The same objects, not copies — the UI holds references to them.
    expect(vault.accounts).toContain(b)
    expect(vault.accounts).toContain(c)
    expect(b.currentAmount).toBe('1234.50')
    expect(b.lastCorrectedAt).toBe('2026-03-31')
    expect(b.iban).toBe('CH9300762011623852957')
  })

  test('leaves categories and their routing alone', () => {
    const vault = createEmptyVault()
    const [a, b] = fourAccounts(vault)
    const spending = addCategory(vault, { sourceAccountId: a.id, sinkAccountId: null })
    const income = addCategory(vault, { type: 'income', sourceAccountId: null, sinkAccountId: b.id })

    reorderAccounts(vault, [b.id, a.id])

    expect(spending.sourceAccountId).toBe(a.id)
    expect(income.sinkAccountId).toBe(b.id)
    expect(vault.budget.categories).toHaveLength(2)
  })
})

describe('deleteAccount — the core invariant', () => {
  test('deleting the last remaining account throws and leaves the vault unchanged', () => {
    const vault = createEmptyVault()
    const only = vault.accounts[0]
    addCategory(vault, { sourceAccountId: only.id, sinkAccountId: null })
    const before = snapshot(vault)

    expect(() => deleteAccount(vault, only.id, only.id)).toThrow(/last remaining account/)
    expect(vault.accounts).toHaveLength(1)
    expect(snapshot(vault)).toBe(before)
  })

  test('the second-to-last delete is allowed, the last one is not', () => {
    const vault = createEmptyVault()
    const main = vault.accounts[0]
    const savings = createAccount(vault, { name: 'Savings' })

    deleteAccount(vault, savings.id, main.id)
    expect(vault.accounts).toHaveLength(1)

    expect(() => deleteAccount(vault, main.id, savings.id)).toThrow(/last remaining account/)
    expect(vault.accounts).toHaveLength(1)
  })
})

describe('deleteAccount — reassignment', () => {
  test('repoints a category sourcing from the deleted account', () => {
    const vault = createEmptyVault()
    const main = vault.accounts[0]
    const doomed = createAccount(vault, { name: 'Doomed' })
    const spending = addCategory(vault, { sourceAccountId: doomed.id, sinkAccountId: null })

    deleteAccount(vault, doomed.id, main.id)

    expect(spending.sourceAccountId).toBe(main.id)
    expect(spending.sinkAccountId).toBeNull()
  })

  test('repoints a category sinking into the deleted account', () => {
    const vault = createEmptyVault()
    const main = vault.accounts[0]
    const doomed = createAccount(vault, { name: 'Doomed' })
    const income = addCategory(vault, {
      type: 'income',
      sourceAccountId: null,
      sinkAccountId: doomed.id,
    })

    deleteAccount(vault, doomed.id, main.id)

    expect(income.sourceAccountId).toBeNull()
    expect(income.sinkAccountId).toBe(main.id)
  })

  test('repoints a category doing both — the (A, A) set-aside case', () => {
    const vault = createEmptyVault()
    const main = vault.accounts[0]
    const doomed = createAccount(vault, { name: 'Doomed' })
    const setaside = addCategory(vault, {
      sourceAccountId: doomed.id,
      sinkAccountId: doomed.id,
      reserve,
    })

    deleteAccount(vault, doomed.id, main.id)

    expect(setaside.sourceAccountId).toBe(main.id)
    expect(setaside.sinkAccountId).toBe(main.id)
  })

  test('collapses a cross-account set-aside into (reassignTo, reassignTo)', () => {
    const vault = createEmptyVault()
    const main = vault.accounts[0]
    const doomed = createAccount(vault, { name: 'Doomed' })
    const setaside = addCategory(vault, { sourceAccountId: main.id, sinkAccountId: doomed.id })

    deleteAccount(vault, doomed.id, main.id)

    expect(setaside.sourceAccountId).toBe(main.id)
    expect(setaside.sinkAccountId).toBe(main.id)
  })

  test('removes the account and leaves unrelated categories untouched', () => {
    const vault = createEmptyVault()
    const main = vault.accounts[0]
    const other = createAccount(vault, { name: 'Other' })
    const doomed = createAccount(vault, { name: 'Doomed' })
    const unrelated = addCategory(vault, { sourceAccountId: other.id, sinkAccountId: null })

    deleteAccount(vault, doomed.id, main.id)

    expect(vault.accounts.map(a => a.id)).toEqual([main.id, other.id])
    expect(unrelated.sourceAccountId).toBe(other.id)
  })

  test('reassignment can never produce an illegal routing', () => {
    // Legality depends only on which endpoints are null, and reassignment
    // substitutes one id for another without ever changing nullness. Every
    // shape that can reference the deleted account is checked here.
    const vault = createEmptyVault()
    const main = vault.accounts[0]
    const doomed = createAccount(vault, { name: 'Doomed' })

    const shapes: Partial<VaultCategory>[] = [
      { type: 'expense', sourceAccountId: doomed.id, sinkAccountId: null },
      { type: 'income', sourceAccountId: null, sinkAccountId: doomed.id },
      { type: 'expense', sourceAccountId: doomed.id, sinkAccountId: doomed.id },
      { type: 'expense', sourceAccountId: doomed.id, sinkAccountId: main.id },
      { type: 'expense', sourceAccountId: main.id, sinkAccountId: doomed.id },
      { type: 'expense', sourceAccountId: doomed.id, sinkAccountId: main.id, reserve },
      { type: 'expense', sourceAccountId: doomed.id, sinkAccountId: doomed.id, reserve },
    ]
    const categories = shapes.map(shape => addCategory(vault, shape))
    expect(categories.every(isLegalCategoryRouting)).toBe(true)

    deleteAccount(vault, doomed.id, main.id)

    for (const category of categories) {
      expect(isLegalCategoryRouting(category)).toBe(true)
      expect(category.sourceAccountId).not.toBe(doomed.id)
      expect(category.sinkAccountId).not.toBe(doomed.id)
    }
  })
})

describe('deleteAccount — bad arguments', () => {
  test('throws when reassignToId does not exist and leaves the vault unchanged', () => {
    const vault = createEmptyVault()
    const main = vault.accounts[0]
    const doomed = createAccount(vault, { name: 'Doomed' })
    addCategory(vault, { sourceAccountId: doomed.id, sinkAccountId: null })
    const before = snapshot(vault)

    expect(() => deleteAccount(vault, doomed.id, 'no-such-account')).toThrow(/not found/)
    expect(vault.accounts.map(a => a.id)).toEqual([main.id, doomed.id])
    expect(snapshot(vault)).toBe(before)
  })

  test('throws when reassignToId equals the deleted id and leaves the vault unchanged', () => {
    const vault = createEmptyVault()
    const doomed = createAccount(vault, { name: 'Doomed' })
    addCategory(vault, { sourceAccountId: doomed.id, sinkAccountId: null })
    const before = snapshot(vault)

    expect(() => deleteAccount(vault, doomed.id, doomed.id)).toThrow(/account being deleted/)
    expect(snapshot(vault)).toBe(before)
  })

  test('throws when the account to delete does not exist', () => {
    const vault = createEmptyVault()
    const main = vault.accounts[0]
    createAccount(vault, { name: 'Savings' })
    const before = snapshot(vault)

    expect(() => deleteAccount(vault, 'no-such-account', main.id)).toThrow(/not found/)
    expect(snapshot(vault)).toBe(before)
  })
})
