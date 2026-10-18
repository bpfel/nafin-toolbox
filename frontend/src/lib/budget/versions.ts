import type { VaultData, VaultSnapshot, VaultSnapshotLine } from '../crypto/vault'
import { listEntries, snapshotLine } from './budgetEngine'
import { planChanges, type PlanChange } from './changes'

/**
 * The plan's versions, newest first: what Budget steps back through.
 *
 * Every finished month keeps a copy of the plan (see `closeMonth`), but most
 * months change nothing, and stepping back through twelve identical Augusts to
 * find the one before the raise would be a chore. So consecutive months whose
 * copies are the same are one version — "July – August 2026" — and the current
 * plan joins the latest of them if nothing has changed since.
 *
 * The months are still stored one each: Belege reads every month against its
 * own copy. Only the stepping is by version.
 */
export interface PlanVersion {
  /** The first month it was the plan for, `'YYYY-MM'`; absent for a plan that has no months yet. */
  from?: string
  /** The last month it was the plan for; `null` while it is the plan now. */
  to: string | null
  /** The copy to show; `null` for the live plan. */
  copy: VaultSnapshot | null
  /** What is different from the version before it; empty for the oldest. */
  changes: PlanChange[]
}

/** What a line says, apart from when it was copied. Order does not count. */
function signature(lines: VaultSnapshotLine[]): string {
  return lines
    .map(l => [l.entryId ?? l.entryName, l.entryName, l.categoryName, l.type, Number(l.plannedAmount).toFixed(4), l.automatic ? 1 : 0].join('\u0001'))
    .sort()
    .join('\u0002')
}

export function planVersions(vault: VaultData): PlanVersion[] {
  const copies = vault.budget.snapshots.filter(s => s.month).sort((a, b) => a.month.localeCompare(b.month))
  const versions: (PlanVersion & { sig: string; lines: VaultSnapshotLine[] })[] = []

  for (const copy of copies) {
    const sig = signature(copy.lines)
    const last = versions[versions.length - 1]
    if (last && last.sig === sig) {
      last.to = copy.month
      last.copy = copy
    } else {
      versions.push({ from: copy.month, to: copy.month, copy, changes: [], sig, lines: copy.lines })
    }
  }

  // The plan now: the latest version still, if nothing has changed since.
  const liveLines = listEntries(vault).map(e => snapshotLine(vault, e))
  const live = signature(liveLines)
  const last = versions[versions.length - 1]
  if (last && last.sig === live) {
    last.to = null
    last.copy = null
  } else {
    versions.push({ from: last ? nextOf(last.to!) : vault.budget.openMonth, to: null, copy: null, changes: [], sig: live, lines: liveLines })
  }

  // Each against the one before it: what a step back would undo.
  for (let i = 1; i < versions.length; i++) versions[i].changes = planChanges(versions[i - 1].lines, versions[i].lines)

  return versions.reverse().map(({ sig: _sig, lines: _lines, ...v }) => v)
}

function nextOf(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
}
