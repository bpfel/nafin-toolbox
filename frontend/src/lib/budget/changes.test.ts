import { describe, test, expect } from 'vitest'
import type { VaultSnapshotLine } from '../crypto/vault'
import { planChanges } from './changes'

const line = (entryId: string, entryName: string, plannedAmount: string, extra: Partial<VaultSnapshotLine> = {}): VaultSnapshotLine =>
  ({ entryId, entryName, categoryName: 'Housing', type: 'expense', plannedAmount, ...extra })

/** What a step back would undo, line by line — every change, none summarised away. */
describe('what changed between two versions', () => {
  test('nothing, when nothing did', () => {
    expect(planChanges([line('r', 'Rent', '1350.00')], [line('r', 'Rent', '1350')])).toEqual([])
  })

  test('an amount, from and to', () => {
    expect(planChanges([line('r', 'Rent', '1350.00')], [line('r', 'Rent', '1400.00')])).toEqual([
      { kind: 'amount', name: 'Rent', category: 'Housing', type: 'expense', from: '1350.00', to: '1400.00' },
    ])
  })

  test('lines added and removed', () => {
    const changes = planChanges([line('r', 'Rent', '1350.00')], [line('g', 'Gym', '60.00')])
    expect(changes.map(c => c.kind)).toEqual(['added', 'removed'])
  })

  test('a rename, a move, a new type and the automatic mark, each said once', () => {
    const before = [line('r', 'Rent', '1350.00')]
    const after = [line('r', 'Miete', '1350.00', { categoryName: 'Home', type: 'bill', automatic: true })]
    expect(planChanges(before, after).map(c => c.kind)).toEqual(['renamed', 'moved', 'retyped', 'automatic'])
  })

  test('amounts first, then what came and went, in the budget’s order', () => {
    const before = [line('a', 'A', '1'), line('b', 'B', '1'), line('c', 'C', '1')]
    const after = [line('a', 'A', '2'), line('n', 'New', '5'), line('c', 'C', '3')]
    expect(planChanges(before, after).map(c => ('name' in c ? c.name : c.kind))).toEqual(['A', 'C', 'New', 'B'])
  })

  test('a long list is all there', () => {
    const before = Array.from({ length: 20 }, (_, i) => line(`e${i}`, `Line ${i}`, '10.00'))
    const after = before.map(l => ({ ...l, plannedAmount: '11.00' }))
    expect(planChanges(before, after)).toHaveLength(20)
  })
})
