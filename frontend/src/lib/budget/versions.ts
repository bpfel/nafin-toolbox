import type { VaultData, VaultSnapshot, VaultSnapshotLine } from '../crypto/vault'
import { listEntries, snapshotLine } from './budgetEngine'

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
  /** A name given to it, if any. */
  name: string
  /** Snapshots taken by hand while it was the plan, from before months were kept. */
  saved: VaultSnapshot[]
}

/** What a line says, apart from when it was copied. Order does not count. */
function signature(lines: VaultSnapshotLine[]): string {
  return lines
    .map(l => [l.entryId ?? l.entryName, l.entryName, l.categoryName, l.type, Number(l.plannedAmount).toFixed(4), l.automatic ? 1 : 0].join('\u0001'))
    .sort()
    .join('\u0002')
}

function localMonth(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function planVersions(vault: VaultData): PlanVersion[] {
  const copies = vault.budget.snapshots.filter(s => s.month).sort((a, b) => a.month!.localeCompare(b.month!))
  const versions: (PlanVersion & { sig: string })[] = []

  for (const copy of copies) {
    const sig = signature(copy.lines)
    const last = versions[versions.length - 1]
    if (last && last.sig === sig) {
      last.to = copy.month!
      last.copy = copy
      if (copy.name) last.name = copy.name
    } else {
      versions.push({ from: copy.month, to: copy.month!, copy, name: copy.name, saved: [], sig })
    }
  }

  // The plan now: the latest version still, if nothing has changed since.
  const live = signature(listEntries(vault).map(e => snapshotLine(vault, e)))
  const last = versions[versions.length - 1]
  if (last && last.sig === live) {
    last.to = null
    last.copy = null
  } else {
    versions.push({ from: last ? nextOf(last.to!) : vault.budget.openMonth, to: null, copy: null, name: '', saved: [], sig: live })
  }

  // Snapshots taken by hand, before months were kept, go with the version that
  // was the plan when they were taken — or the oldest, if they are older.
  for (const snapshot of vault.budget.snapshots.filter(s => !s.month)) {
    const month = localMonth(snapshot.createdAt)
    const home =
      versions.find(v => v.from !== undefined && v.from <= month && (v.to === null || month <= v.to)) ??
      (versions.find(v => v.from !== undefined && month < v.from) ? versions[0] : versions[versions.length - 1])
    home.saved.push(snapshot)
  }

  return versions.reverse().map(({ sig: _sig, ...v }) => v)
}

function nextOf(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
}
