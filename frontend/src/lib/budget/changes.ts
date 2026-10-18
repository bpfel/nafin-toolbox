import type { EntryType, VaultSnapshotLine } from '../crypto/vault'

/**
 * What changed between two versions of the plan, line by line.
 *
 * Instead of a name somebody would have to think of and type, the app says what
 * was different: "Salary 5'600.00 → 6'000.00". Every change is listed — a move
 * or a new insurance can touch a dozen lines, and a summary that stopped at
 * three would hide the one being looked for.
 *
 * Lines are matched by entry id, and by name where an old copy has none.
 */
export type PlanChange =
  | { kind: 'amount'; name: string; category: string; type: EntryType; from: string; to: string }
  | { kind: 'added'; name: string; category: string; type: EntryType; amount: string }
  | { kind: 'removed'; name: string; category: string; type: EntryType; amount: string }
  | { kind: 'renamed'; from: string; to: string }
  | { kind: 'moved'; name: string; from: string; to: string }
  | { kind: 'retyped'; name: string; from: EntryType; to: EntryType }
  | { kind: 'automatic'; name: string; on: boolean }

const ORDER: PlanChange['kind'][] = ['amount', 'added', 'removed', 'renamed', 'moved', 'retyped', 'automatic']

const keyOf = (l: VaultSnapshotLine) => l.entryId ?? `name:${l.entryName}`
const same = (a: string, b: string) => Number(a).toFixed(4) === Number(b).toFixed(4)

export function planChanges(before: VaultSnapshotLine[], after: VaultSnapshotLine[]): PlanChange[] {
  const old = new Map(before.map(l => [keyOf(l), l]))
  const changes: PlanChange[] = []

  for (const line of after) {
    const was = old.get(keyOf(line))
    old.delete(keyOf(line))
    if (!was) {
      changes.push({ kind: 'added', name: line.entryName, category: line.categoryName, type: line.type, amount: line.plannedAmount })
      continue
    }
    if (was.entryName !== line.entryName) changes.push({ kind: 'renamed', from: was.entryName, to: line.entryName })
    if (was.categoryName !== line.categoryName) {
      changes.push({ kind: 'moved', name: line.entryName, from: was.categoryName, to: line.categoryName })
    }
    if (was.type !== line.type) changes.push({ kind: 'retyped', name: line.entryName, from: was.type, to: line.type })
    if (!same(was.plannedAmount, line.plannedAmount)) {
      changes.push({ kind: 'amount', name: line.entryName, category: line.categoryName, type: line.type, from: was.plannedAmount, to: line.plannedAmount })
    }
    if (!!was.automatic !== !!line.automatic) changes.push({ kind: 'automatic', name: line.entryName, on: !!line.automatic })
  }
  for (const gone of old.values()) {
    changes.push({ kind: 'removed', name: gone.entryName, category: gone.categoryName, type: gone.type, amount: gone.plannedAmount })
  }

  // Most-looked-for first: amounts, then lines that came and went. Stable
  // within a kind, so they keep the budget's order.
  return changes
    .map((c, i) => ({ c, i }))
    .sort((a, b) => ORDER.indexOf(a.c.kind) - ORDER.indexOf(b.c.kind) || a.i - b.i)
    .map(({ c }) => c)
}
