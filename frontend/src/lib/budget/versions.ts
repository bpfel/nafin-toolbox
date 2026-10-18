import type { VaultData, VaultSnapshot, VaultSnapshotLine } from '../crypto/vault'
import { nextMonth } from '../util/calendar'
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
 *
 * Computed, not stored, and stable where it needs to be: copies are never
 * changed once written, so a past version keeps its months for good. Only the
 * newest end moves — a month ending extends it, an edit splits the plan now off
 * it, undoing the edit joins them again. That is why a version is named by its
 * first month (`from`), which none of those moves changes.
 */
export interface PlanVersion {
  /** The first month it was the plan for, `'YYYY-MM'`; absent for a plan that has no months yet. */
  from?: string
  /** The last month it was the plan for; `null` while it is the plan now. */
  to: string | null
  /** The copy it was read from; `null` for the live plan. */
  copy: VaultSnapshot | null
  /** The budget's lines in it — a copy's, without what was only kept for Belege. */
  lines: VaultSnapshotLine[]
}

/**
 * Lines of a copy that were the budget. A copy also carries archived entries a
 * month's records were counted against; those were not in the budget then.
 */
function budgetLines(copy: VaultSnapshot): VaultSnapshotLine[] {
  return copy.lines.filter(l => !l.archived)
}

/** What a line says, apart from when it was copied. Order does not count. */
function signature(lines: VaultSnapshotLine[]): string {
  return lines
    // The reserve is left out: a new target moves the monthly figure, which is
    // compared, and copies taken before reserves were kept would otherwise all
    // look changed.
    .map(l => [l.entryId ?? l.entryName, l.entryName, l.categoryName, l.type, Number(l.plannedAmount).toFixed(4), l.automatic ? 1 : 0].join('\u0001'))
    .sort()
    .join('\u0002')
}

// A copy never changes once written, so its signature is worked out once.
const signatures = new WeakMap<VaultSnapshot, string>()
function signatureOf(copy: VaultSnapshot): string {
  let sig = signatures.get(copy)
  if (sig === undefined) signatures.set(copy, (sig = signature(budgetLines(copy))))
  return sig
}

export function planVersions(vault: VaultData): PlanVersion[] {
  const copies = vault.budget.snapshots
    // A backdated copy is today's budget filed under an old month, and a month
    // with no budget in it is not a version of one.
    .filter(s => s.month && !s.backdated && budgetLines(s).length > 0)
    .sort((a, b) => a.month.localeCompare(b.month))
  const versions: (PlanVersion & { sig: string })[] = []

  for (const copy of copies) {
    const sig = signatureOf(copy)
    const last = versions[versions.length - 1]
    if (last && last.sig === sig) {
      last.to = copy.month
      last.copy = copy
    } else {
      versions.push({ from: copy.month, to: copy.month, copy, lines: budgetLines(copy), sig })
    }
  }

  // The plan now: the latest version still, if nothing has changed since.
  const liveLines = listEntries(vault).map(e => snapshotLine(vault, e))
  const live = signature(liveLines)
  const last = versions[versions.length - 1]
  if (last && last.sig === live) {
    last.to = null
    last.copy = null
    last.lines = liveLines
  } else {
    versions.push({ from: last ? nextMonth(last.to!) : vault.budget.openMonth, to: null, copy: null, lines: liveLines, sig: live })
  }

  return versions.reverse().map(({ sig: _sig, ...v }) => v)
}

/**
 * What changed after the version at `index` — what made the next one
 * different — and the month that next one started. Only ever wanted for the
 * version on screen, so it is worked out for that one alone. Nothing for the
 * plan now, which has nothing after it.
 */
export function changesAfter(versions: PlanVersion[], index: number): { changes: PlanChange[]; from?: string } {
  const next = versions[index - 1]
  if (!next) return { changes: [] }
  return { changes: planChanges(versions[index].lines, next.lines), from: next.from }
}
