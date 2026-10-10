import { savesTowardsTarget, sideOf, type EntryType, type VaultData, type VaultSnapshot } from '../crypto/vault'
import * as budget from '../budget/budgetEngine'
import * as accounts from '../accounts/accountsEngine'
import { isLegalRouting } from '../accounts/routing'
import { recordCompleted, recordDismissed } from '../tour/tourState'
import { recording, replaying, type Tape } from './source'

/**
 * Every change a vault can undergo, by name.
 *
 * A change is kept as `{ kind, args }` so that it can be applied a second time
 * onto a vault somebody else has saved since (see `queue.ts`). The names are
 * the engine functions' own: replaying an action is calling the function
 * again, so there is no second vocabulary to keep in step with the first.
 *
 * What each entry adds to its engine function is a `check`, asked before the
 * action is applied again: is the thing it changes still there, and has its
 * effect already happened? An action that answers `done` is skipped without a
 * word — the save that carried it reached the server even if its answer did
 * not. One that answers with a refusal is dropped and the user is told why,
 * using the `subject` it noted when it was made, since the thing it names may
 * be gone by then.
 */

/** Why an action can no longer be applied. Turned into words by the screens. */
export type RefusalCode =
  | 'entryGone'
  | 'entryChanged'
  | 'categoryGone'
  | 'nameTaken'
  | 'snapshotGone'
  | 'accountGone'
  | 'lastAccount'
  | 'pinMismatch'
  | 'failed'

export type Verdict = 'go' | 'done' | RefusalCode

interface ActionDef<A extends unknown[], R = unknown> {
  apply(vault: VaultData, ...args: A): R
  /**
   * Adds to the arguments what only the moment of making knows, before they are
   * kept: which category a name meant, while it still means that one.
   */
  pin?(vault: VaultData, args: NoInfer<A>): NoInfer<A>
  check?(vault: VaultData, args: NoInfer<A>, tape: Tape): Verdict
  /** What it is about, in words, noted when made — for the message if it is ever refused. */
  subject?(vault: VaultData, args: NoInfer<A>): string | undefined
  /**
   * For an action that sets one value: that value as it stands in `vault`, and
   * the value this action sets. Lets a replay notice that it is about to write
   * over something somebody else changed a moment ago, and say so.
   */
  sets?: {
    read(vault: VaultData, args: NoInfer<A>): string | undefined
    written(args: NoInfer<A>): string | undefined
    /** The same action, setting `value` instead: what Undo commits. */
    with(args: NoInfer<A>, value: string): NoInfer<A>
    /** Whether the value is an amount, so the message renders it as money. */
    money?: true
  }
}

function def<A extends unknown[], R>(d: ActionDef<A, R>): ActionDef<A, R> {
  return d
}

/** An argument list, typed as one rather than as an array. */
const tuple = <T extends unknown[]>(...items: T): T => items

const entry = (vault: VaultData, id: string) => vault.budget.entries.find(e => e.id === id)
const category = (vault: VaultData, id: string) => vault.budget.categories.find(c => c.id === id)
const account = (vault: VaultData, id: string | null) =>
  id === null ? null : vault.accounts.find(a => a.id === id)
const snapshot = (vault: VaultData, id: string) => vault.budget.snapshots.find(s => s.id === id)

/** The id of the category a name refers to now, on the side an entry type sits on. */
const categoryIdFor = (vault: VaultData, name: string, type: EntryType) =>
  vault.budget.categories.find(c => c.name === name && c.side === sideOf(type))?.id

const needEntry = (vault: VaultData, id: string): Verdict => (entry(vault, id) ? 'go' : 'entryGone')
const entryName = (vault: VaultData, [id]: [string, ...unknown[]]) => entry(vault, id)?.name
const accountName = (vault: VaultData, [id]: [string, ...unknown[]]) => account(vault, id)?.name

/** Already applied, if the first id it was handed already exists. */
function created(exists: (vault: VaultData, id: string) => unknown, kind: keyof Tape['ids']) {
  return (vault: VaultData, _args: unknown, tape: Tape): Verdict => {
    const id = tape.ids[kind]?.[0]
    return id !== undefined && exists(vault, id) ? 'done' : 'go'
  }
}

/** First pin wins; epochs only rise. See `rememberTrust` in the store. */
function rememberTrust(vault: VaultData, userId: string, verifyingKey: string, householdId: string, epoch: number): void {
  vault.trust.pins[userId] ??= verifyingKey
  if ((vault.trust.epochs[householdId] ?? 0) < epoch) vault.trust.epochs[householdId] = epoch
}

export const ACTIONS = {
  // --- the plan ---
  setPlanned: def({
    apply: budget.setPlanned,
    check: (v, [entryId]) => needEntry(v, entryId),
    subject: entryName,
    sets: {
      read: (v, [entryId]) => budget.plannedFor(v, entryId),
      written: ([, amount]) => amount,
      with: ([entryId], amount) => tuple(entryId, amount),
      money: true,
    },
  }),

  // --- entries ---
  createEntry: def({
    apply: budget.createEntry,
    pin: (v, [opts]) => tuple({ ...opts, categoryId: opts.categoryId ?? categoryIdFor(v, opts.categoryName, opts.type) }),
    check: created(entry, 'entry'),
    subject: (_v, [opts]) => opts.name,
  }),
  updateEntry: def({
    apply: budget.updateEntry,
    pin: (v, [entryId, update]) => {
      const e = entry(v, entryId)
      if (update.categoryName === undefined || !e || update.categoryId) return tuple(entryId, update)
      const categoryId = categoryIdFor(v, update.categoryName, update.type ?? e.type)
      return tuple(entryId, categoryId ? { ...update, categoryId } : update)
    },
    check: (v, [entryId]) => needEntry(v, entryId),
    subject: entryName,
    // Only the name: the other fields an edit carries are what the form
    // already showed, and comparing them would report the form, not a person.
    sets: {
      read: (v, [entryId, update]) => (update.name === undefined ? undefined : entry(v, entryId)?.name),
      written: ([, update]) => update.name,
      with: ([entryId, update], name) => tuple(entryId, { ...update, name }),
    },
  }),
  setReserve: def({
    apply: budget.setReserve,
    check: (v, [entryId]) => {
      const e = entry(v, entryId)
      if (!e) return 'entryGone'
      // Somebody made it an expense in the meantime: it has no target to set.
      return savesTowardsTarget(e.type) ? 'go' : 'entryChanged'
    },
    subject: entryName,
  }),
  deleteEntry: def({
    apply: budget.deleteEntry,
    check: (v, [entryId]) => (entry(v, entryId) ? 'go' : 'done'),
    subject: entryName,
  }),
  reorderEntries: def({ apply: budget.reorderEntries }),

  // --- categories ---
  updateCategory: def({
    apply: budget.updateCategory,
    check: (v, [categoryId, update]) => {
      const c = category(v, categoryId)
      if (!c) return 'categoryGone'
      const name = (update.name ?? c.name).trim()
      return budget.findCategoryConflict(v, categoryId, name, update.side ?? c.side) ? 'nameTaken' : 'go'
    },
    subject: (v, [categoryId]) => category(v, categoryId)?.name,
    sets: {
      read: (v, [categoryId, update]) => (update.name === undefined ? undefined : category(v, categoryId)?.name),
      written: ([, update]) => update.name?.trim(),
      with: ([categoryId, update], name) => tuple(categoryId, { ...update, name }),
    },
  }),
  mergeCategory: def({
    apply: budget.mergeCategory,
    check: (v, [fromId, intoId]) => {
      if (!category(v, fromId)) return 'done'
      return category(v, intoId) ? 'go' : 'categoryGone'
    },
    subject: (v, [fromId]) => category(v, fromId)?.name,
  }),
  reorderCategories: def({ apply: budget.reorderCategories }),

  // --- snapshots ---
  // Carries the snapshot as built on screen, not the name to build one from:
  // see `buildSnapshot`.
  takeSnapshot: def({
    // A copy, so the vault and the queued action never share one object.
    apply: (v: VaultData, built: VaultSnapshot) => budget.insertSnapshot(v, structuredClone(built)),
    check: (v, [built]) => (snapshot(v, built.id) ? 'done' : 'go'),
    subject: (_v, [built]) => built.name,
  }),
  renameSnapshot: def({
    apply: budget.renameSnapshot,
    check: (v, [id]) => (snapshot(v, id) ? 'go' : 'snapshotGone'),
    subject: (v, [id]) => snapshot(v, id)?.name,
    sets: {
      read: (v, [id]) => snapshot(v, id)?.name,
      written: ([, name]) => name.trim(),
      with: ([id], name) => tuple(id, name),
    },
  }),
  deleteSnapshot: def({
    apply: budget.deleteSnapshot,
    check: (v, [id]) => (snapshot(v, id) ? 'go' : 'done'),
    subject: (v, [id]) => snapshot(v, id)?.name,
  }),

  // --- the whole budget ---
  resetBudget: def({ apply: budget.resetBudget }),
  // Seeding is for an empty budget. If somebody else filled it first, what was
  // asked for has happened, and doing it twice would double every line.
  seedDefaults: def({
    apply: budget.seedDefaults,
    check: v => (v.budget.entries.length > 0 ? 'done' : 'go'),
  }),
  seedSharedDefaults: def({
    apply: budget.seedSharedDefaults,
    check: v => (v.budget.entries.length > 0 ? 'done' : 'go'),
  }),

  // --- accounts ---
  createAccount: def({
    apply: accounts.createAccount,
    check: created(account, 'account'),
    subject: (_v, [opts]) => opts.name,
  }),
  renameAccount: def({
    apply: accounts.renameAccount,
    check: (v, [id]) => (account(v, id) ? 'go' : 'accountGone'),
    subject: accountName,
    sets: {
      read: (v, [id]) => account(v, id)?.name,
      written: ([, name]) => name,
      with: ([id], name) => tuple(id, name),
    },
  }),
  deleteAccount: def({
    apply: accounts.deleteAccount,
    check: (v, [id, reassignToId]) => {
      if (!account(v, id)) return 'done'
      if (!account(v, reassignToId)) return 'accountGone'
      return v.accounts.length > 1 ? 'go' : 'lastAccount'
    },
    subject: accountName,
  }),
  setAccountDetails: def({
    apply: accounts.setAccountDetails,
    check: (v, [id]) => (account(v, id) ? 'go' : 'accountGone'),
    subject: accountName,
  }),
  reorderAccounts: def({ apply: accounts.reorderAccounts }),
  correctBalance: def({
    apply: accounts.correctBalance,
    check: (v, [id]) => (account(v, id) ? 'go' : 'accountGone'),
    subject: accountName,
    sets: {
      read: (v, [id]) => account(v, id)?.currentAmount,
      written: ([, amount]) => amount,
      with: ([id, , atDate], amount) => tuple(id, amount, atDate),
      money: true,
    },
  }),
  setRouting: def({
    apply: accounts.setRouting,
    check: (v, [entryId, source, sink]) => {
      const e = entry(v, entryId)
      if (!e) return 'entryGone'
      if (account(v, source) === undefined || account(v, sink) === undefined) return 'accountGone'
      return isLegalRouting(e.type, source, sink) ? 'go' : 'entryChanged'
    },
    subject: entryName,
  }),

  // --- the tour ---
  // The first answer stands; a second device saying it again changes nothing.
  recordTourCompleted: def({
    apply: recordCompleted,
    check: v => (v.tour.completedAt === null ? 'go' : 'done'),
  }),
  recordTourDismissed: def({
    apply: recordDismissed,
    check: v => (v.tour.dismissedAt === null ? 'go' : 'done'),
  }),

  // --- trust ---
  // A pin that disagrees is not merged one way or the other: it is a key that
  // changed, which is the one thing pins exist to catch.
  rememberTrust: def({
    apply: rememberTrust,
    check: (v, [userId, verifyingKey]) => {
      const pinned = v.trust.pins[userId]
      return pinned === undefined || pinned === verifyingKey ? 'go' : 'pinMismatch'
    },
  }),
}

export type ActionKind = keyof typeof ACTIONS

type DefArgs<D> = D extends ActionDef<infer A, infer _R> ? A : never
export type ActionArgs<K extends ActionKind> = DefArgs<(typeof ACTIONS)[K]>
type DefResult<D> = D extends ActionDef<infer _A, infer R> ? R : never
export type ActionResult<K extends ActionKind> = DefResult<(typeof ACTIONS)[K]>

export interface Action<K extends ActionKind = ActionKind> {
  kind: K
  args: ActionArgs<K>
  /** The ids and times it was handed the first time. */
  tape: Tape
  /** What it was about, in words, when it was made. */
  subject?: string
}

/* The registry is heterogeneous; inside these two functions each entry is used
   only with arguments typed for it by `Action<K>`, so widening here is safe. */
type AnyDef = ActionDef<unknown[]>
const defOf = (kind: ActionKind) => ACTIONS[kind] as unknown as AnyDef

/**
 * Apply a change for the first time, and keep it as an action.
 *
 * Whatever the engine throws — an empty name, a name already taken — is thrown
 * on, before anything is kept: a change that was refused on screen is not one
 * to save.
 */
export function perform<K extends ActionKind>(
  vault: VaultData,
  kind: K,
  args: ActionArgs<K>,
): { action: Action<K>; result: ActionResult<K> } {
  const d = defOf(kind)
  args = (d.pin?.(vault, args as unknown[]) ?? args) as ActionArgs<K>
  const subject = d.subject?.(vault, args as unknown[])
  const { result, tape } = recording(() => d.apply(vault, ...(args as unknown[])))
  return {
    action: { kind, args, tape, ...(subject === undefined ? {} : { subject }) },
    result: result as ActionResult<K>,
  }
}

/** Somebody else changed what this action sets, and it is about to set it again. */
export interface Overwrite {
  action: Action
  /** What they had set it to. */
  theirs: string
  /** What this action sets it to. */
  mine: string
  money: boolean
  /** The same action, putting their value back. */
  undo: Action
}

/**
 * Whether replaying `action` onto `fresh` writes over a change somebody else
 * made since `base` — the vault this client last saw from the server.
 *
 * Only for actions that set one value, and only when all three differ: the
 * value moved between `base` and `fresh` (somebody else changed it), and this
 * action sets something else again. Setting it to what they already chose is
 * agreement, not an overwrite.
 */
export function overwriteBy(base: VaultData, fresh: VaultData, action: Action): Overwrite | null {
  const sets = defOf(action.kind).sets
  if (!sets) return null
  const args = action.args as unknown[]
  const before = sets.read(base, args)
  const theirs = sets.read(fresh, args)
  const mine = sets.written(args)
  if (before === undefined || theirs === undefined || mine === undefined) return null
  if (before === theirs || theirs === mine) return null
  return {
    action,
    theirs,
    mine,
    money: sets.money === true,
    undo: { ...action, args: sets.with(args, theirs) as never, tape: { ids: {}, times: [] } },
  }
}

/**
 * Apply an action again, onto a vault that may have moved on since.
 *
 * Applied to a copy, which replaces the vault only if the engine finished: an
 * engine that throws part-way must not leave half a change behind.
 */
export function reapply(vault: VaultData, action: Action): { vault: VaultData; verdict: Verdict } {
  const d = defOf(action.kind)
  const args = action.args as unknown[]
  const verdict = d.check?.(vault, args, action.tape) ?? 'go'
  if (verdict !== 'go') return { vault, verdict }

  const copy = structuredClone(vault)
  try {
    replaying(action.tape, () => d.apply(copy, ...args))
  } catch {
    return { vault, verdict: 'failed' }
  }
  return { vault: copy, verdict: 'go' }
}
