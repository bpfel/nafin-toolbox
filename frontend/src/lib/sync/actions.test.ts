import { describe, test, expect } from 'vitest'
import { createEmptyVault, type VaultData } from '../crypto/vault'
import * as budget from '../budget/budgetEngine'
import * as accounts from '../accounts/accountsEngine'
import { perform, reapply, ACTIONS, type ActionKind, type ActionArgs, type Action } from './actions'
import { enqueue, replayAll } from './queue'

/**
 * The three rules every action obeys, held for every kind.
 *
 * 1. Applied again onto the vault it was made on, it produces the same vault.
 * 2. Applied twice, it produces what applying it once does.
 * 3. Applied where what it changes is gone, it is refused and changes nothing.
 *
 * Without the first, a replayed entry would come back under another id; without
 * the second, a save whose answer was lost would double what it carried.
 */

/** A budget with something in every corner an action can reach. */
function filled(): VaultData {
  const v = createEmptyVault('Main')
  budget.seedDefaults(v, 'en', '2026-01')
  accounts.createAccount(v, { name: 'Savings', kind: 'savings' })
  budget.takeSnapshot(v, 'January')
  return v
}

const clone = (v: VaultData) => structuredClone(v)

function firstEntry(v: VaultData, type: string) {
  return v.budget.entries.find(e => e.type === type)!
}

/** One way to call each kind, against the vault it is given. */
type Case = { [K in ActionKind]: { kind: K; args: (v: VaultData) => ActionArgs<K> } }[ActionKind]

const CASES: Case[] = [
  { kind: 'setPlanned', args: v => [firstEntry(v, 'expense').id, '123.45'] },
  {
    kind: 'createEntry',
    args: () => [{ name: 'Dentist', type: 'expense', categoryName: 'Health', plannedAmount: '40.00' }],
  },
  { kind: 'updateEntry', args: v => [firstEntry(v, 'expense').id, { name: 'Renamed', categoryName: 'Elsewhere' }] },
  {
    kind: 'setReserve',
    args: v => [firstEntry(v, 'bill').id, { targetAmount: '900.00', periodMonths: 6, anchorMonth: '2026-03' }],
  },
  { kind: 'deleteEntry', args: v => [firstEntry(v, 'expense').id] },
  { kind: 'reorderEntries', args: v => [[...v.budget.entries].reverse().map(e => e.id)] },
  { kind: 'updateCategory', args: v => [v.budget.categories[0].id, { name: 'Renamed category' }] },
  {
    kind: 'mergeCategory',
    args: v => {
      const expense = v.budget.categories.filter(c => c.side === 'expense')
      return [expense[0].id, expense[1].id]
    },
  },
  { kind: 'reorderCategories', args: v => [[...v.budget.categories].reverse().map(c => c.id)] },
  { kind: 'takeSnapshot', args: v => [budget.buildSnapshot(v, 'February')] },
  { kind: 'renameSnapshot', args: v => [v.budget.snapshots[0].id, 'Renamed snapshot'] },
  { kind: 'deleteSnapshot', args: v => [v.budget.snapshots[0].id] },
  { kind: 'resetBudget', args: () => [] },
  { kind: 'createAccount', args: () => [{ name: 'Cash', kind: 'cash' }] },
  { kind: 'renameAccount', args: v => [v.accounts[1].id, 'Renamed account'] },
  { kind: 'deleteAccount', args: v => [v.accounts[1].id, v.accounts[0].id] },
  {
    kind: 'setAccountDetails',
    args: v => [v.accounts[1].id, { kind: 'savings', bankName: 'ZKB', iban: 'CH93 0076 2011 6238 5295 7', ibanKind: 'iban' }],
  },
  { kind: 'reorderAccounts', args: v => [[...v.accounts].reverse().map(a => a.id)] },
  { kind: 'correctBalance', args: v => [v.accounts[0].id, '5000.00', '2026-02-01'] },
  {
    kind: 'setRouting',
    args: v => [firstEntry(v, 'savings').id, v.accounts[0].id, v.accounts[1].id],
  },
  { kind: 'recordTourCompleted', args: () => [] },
  { kind: 'recordTourDismissed', args: () => [] },
  { kind: 'rememberTrust', args: () => ['7', 'key-seven', '3', 2] },
  { kind: 'nameMember', args: () => ['7', 'Ben'] },
]

const caseOf = (kind: ActionKind) => CASES.find(c => c.kind === kind)!

/** Seeding wants an empty budget, so it is held separately. */
const SEED_CASES: Case[] = [
  { kind: 'seedDefaults', args: () => ['en', '2026-01'] },
  { kind: 'seedSharedDefaults', args: () => ['de', '2026-01'] },
]

function made(base: VaultData, c: Case): { after: VaultData; action: Action } {
  const after = clone(base)
  const { action } = perform(after, c.kind, c.args(after) as never)
  return { after, action: structuredClone(action) }
}

test('every action kind has a case', () => {
  const covered = new Set([...CASES, ...SEED_CASES].map(c => c.kind))
  expect([...covered].sort()).toEqual(Object.keys(ACTIONS).sort())
})

describe.each([
  ...CASES.map(c => ({ c, base: filled })),
  ...SEED_CASES.map(c => ({ c, base: () => createEmptyVault('Main') })),
])('$c.kind', ({ c, base }) => {
  test('applied again onto the same vault, gives the same vault', () => {
    const before = base()
    const { after, action } = made(before, c)
    const { vault, verdict } = reapply(clone(before), action)
    expect(verdict).toBe('go')
    expect(vault).toEqual(after)
  })

  test('applied twice, gives what applying it once does', () => {
    const before = base()
    const { after, action } = made(before, c)
    const { vault, verdict } = reapply(after, action)
    expect(['go', 'done']).toContain(verdict)
    expect(vault).toEqual(after)
  })
})

describe('refused where what it changes is gone', () => {
  const gone: { name: string; c: Case; remove: (v: VaultData) => void; reason: string }[] = [
    {
      name: 'setPlanned on a deleted entry',
      c: caseOf('setPlanned'),
      remove: v => budget.deleteEntry(v, firstEntry(v, 'expense').id),
      reason: 'entryGone',
    },
    {
      name: 'updateEntry on a deleted entry',
      c: caseOf('updateEntry'),
      remove: v => budget.deleteEntry(v, firstEntry(v, 'expense').id),
      reason: 'entryGone',
    },
    {
      name: 'setReserve on an entry that became an expense',
      c: caseOf('setReserve'),
      remove: v => budget.updateEntry(v, firstEntry(v, 'bill').id, { type: 'expense' }),
      reason: 'entryChanged',
    },
    {
      name: 'updateCategory on a deleted category',
      c: caseOf('updateCategory'),
      remove: v => {
        const id = v.budget.categories[0].id
        for (const e of budget.entriesInCategory(v, id)) budget.deleteEntry(v, e.id)
      },
      reason: 'categoryGone',
    },
    {
      name: 'renameSnapshot on a deleted snapshot',
      c: caseOf('renameSnapshot'),
      remove: v => budget.deleteSnapshot(v, v.budget.snapshots[0].id),
      reason: 'snapshotGone',
    },
    {
      name: 'renameAccount on a deleted account',
      c: caseOf('renameAccount'),
      remove: v => accounts.deleteAccount(v, v.accounts[1].id, v.accounts[0].id),
      reason: 'accountGone',
    },
    {
      name: 'correctBalance on a deleted account',
      c: { kind: 'correctBalance', args: v => [v.accounts[1].id, '1.00', '2026-02-01'] },
      remove: v => accounts.deleteAccount(v, v.accounts[1].id, v.accounts[0].id),
      reason: 'accountGone',
    },
    {
      name: 'deleteAccount whose reassignment target is gone',
      c: { kind: 'deleteAccount', args: v => [v.accounts[0].id, v.accounts[1].id] },
      remove: v => accounts.deleteAccount(v, v.accounts[1].id, v.accounts[0].id),
      reason: 'accountGone',
    },
    {
      name: 'setRouting to a deleted account',
      c: caseOf('setRouting'),
      remove: v => accounts.deleteAccount(v, v.accounts[1].id, v.accounts[0].id),
      reason: 'accountGone',
    },
  ]

  test.each(gone)('$name', ({ c, remove, reason }) => {
    const before = filled()
    const { action } = made(before, c)
    const elsewhere = clone(before)
    remove(elsewhere)
    const untouched = clone(elsewhere)

    const { vault, verdict } = reapply(elsewhere, action)
    expect(verdict).toBe(reason)
    expect(vault).toEqual(untouched)
  })

  test('a disagreeing trust pin is refused, not merged either way', () => {
    const v = filled()
    const { action } = perform(clone(v), 'rememberTrust', ['7', 'key-a', '3', 1])
    v.trust.pins['7'] = 'key-b'
    expect(reapply(v, action).verdict).toBe('pinMismatch')
  })

  // Last writer wins: only the owner names people, so two names racing means
  // one owner on two devices.
  test('nameMember: a later name replaces an earlier one, and an empty one clears it', () => {
    const v = filled()
    perform(v, 'nameMember', ['7', 'Ben'])
    const { action } = perform(clone(v), 'nameMember', ['7', 'Benji'])
    expect(reapply(v, action).vault.people['7']).toEqual({ name: 'Benji' })

    perform(v, 'nameMember', ['7', '  '])
    expect(v.people['7']).toBeUndefined()
  })
})

describe('what an action keeps', () => {
  test('notes what it was about, while that can still be read', () => {
    const v = filled()
    const rent = firstEntry(v, 'expense')
    const { action } = perform(v, 'deleteEntry', [rent.id])
    expect(action.subject).toBe(rent.name)
  })

  test('a snapshot replays as it was taken, not as the plan is now', () => {
    const before = filled()
    const { after, action } = made(before, { kind: 'takeSnapshot', args: v => [budget.buildSnapshot(v, 'As seen')] })
    const taken = after.budget.snapshots.find(s => s.name === 'As seen')!

    const elsewhere = clone(before)
    budget.setPlanned(elsewhere, firstEntry(elsewhere, 'expense').id, '9999.00')

    const { vault } = reapply(elsewhere, action)
    expect(vault.budget.snapshots.find(s => s.name === 'As seen')).toEqual(taken)
  })

  test('an entry added to a category deleted elsewhere keeps its id, and the category comes back', () => {
    const before = filled()
    const { after, action } = made(before, caseOf('createEntry'))
    const added = after.budget.entries.find(e => e.name === 'Dentist')!

    const elsewhere = clone(before)
    const { vault } = reapply(elsewhere, action)
    const replayed = vault.budget.entries.find(e => e.name === 'Dentist')!
    expect(replayed.id).toBe(added.id)
    expect(vault.budget.categories.find(c => c.id === replayed.categoryId)?.name).toBe('Health')
  })
})

describe('the queue', () => {
  test('successive amounts typed into one entry are one change', () => {
    const v = filled()
    const id = firstEntry(v, 'expense').id
    let queue: Action[] = []
    for (const amount of ['1', '12', '120']) queue = enqueue(queue, perform(v, 'setPlanned', [id, amount]).action)
    expect(queue).toHaveLength(1)
    expect(queue[0].args).toEqual([id, '120'])
  })

  test('amounts typed into two entries are two changes', () => {
    const v = filled()
    const [a, b] = v.budget.entries
    let queue: Action[] = []
    queue = enqueue(queue, perform(v, 'setPlanned', [a.id, '1']).action)
    queue = enqueue(queue, perform(v, 'setPlanned', [b.id, '2']).action)
    expect(queue).toHaveLength(2)
  })

  test('replays everything it can, and reports what it cannot', () => {
    const before = filled()
    const local = clone(before)
    const rent = firstEntry(local, 'expense')
    const other = local.budget.entries.find(e => e.type === 'expense' && e.id !== rent.id)!

    let queue: Action[] = []
    queue = enqueue(queue, perform(local, 'setPlanned', [rent.id, '1.00']).action)
    queue = enqueue(queue, perform(local, 'setPlanned', [other.id, '2.00']).action)

    const elsewhere = clone(before)
    budget.deleteEntry(elsewhere, rent.id)

    const { vault, dropped } = replayAll(elsewhere, queue)
    expect(dropped.map(d => [d.action.subject, d.reason])).toEqual([[rent.name, 'entryGone']])
    expect(budget.plannedFor(vault, other.id)).toBe('2.00')
  })
})
