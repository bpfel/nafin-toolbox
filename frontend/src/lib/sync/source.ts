/**
 * Where the engines get their ids and their sense of the time.
 *
 * Every change to a vault is kept as an action so that it can be applied a
 * second time, onto a newer vault, when somebody else saved first (see
 * `queue.ts`). That only works if applying it again produces the same thing.
 * An entry created with one id on screen and another in the replay would leave
 * everything holding the first id pointing at nothing; a snapshot replayed with
 * a fresh timestamp would claim to have been taken when it was saved.
 *
 * So the engines do not call `crypto.randomUUID()` or `new Date()` themselves.
 * They ask here, and here is one of three things:
 *
 * - **live** — the default, and what every test and every read gets: fresh
 *   values, as before.
 * - **recording** — while an action is first applied. Whatever was handed out
 *   is written down on a tape the action keeps.
 * - **replaying** — while the action is applied again. The tape is played back,
 *   and only once it runs out are fresh values made.
 *
 * Ids are taped per kind, not in one line. Replayed onto a newer vault, an
 * action can need an id it did not need the first time: adding an entry to a
 * category that somebody has since deleted has to make the category again.
 * Were there a single line of ids, that new category would take the id the
 * entry had on screen, and the entry would get a new one. Per kind, the
 * category gets a fresh id and the entry keeps its own.
 *
 * Module state rather than a parameter, because applying an action is
 * synchronous: nothing else can run between setting the tape and clearing it.
 */

export type IdKind = 'category' | 'entry' | 'snapshot' | 'account'

/** What an action was handed the first time it ran. */
export interface Tape {
  ids: Partial<Record<IdKind, string[]>>
  times: string[]
}

type Mode =
  | { kind: 'live' }
  | { kind: 'recording'; tape: Tape }
  | { kind: 'replaying'; ids: Partial<Record<IdKind, string[]>>; times: string[] }

let mode: Mode = { kind: 'live' }

export function emptyTape(): Tape {
  return { ids: {}, times: [] }
}

/** A fresh id, or the one this action was handed the first time. */
export function newId(kind: IdKind): string {
  if (mode.kind === 'replaying') {
    const next = mode.ids[kind]?.shift()
    if (next !== undefined) return next
    return crypto.randomUUID()
  }
  const id = crypto.randomUUID()
  if (mode.kind === 'recording') (mode.tape.ids[kind] ??= []).push(id)
  return id
}

/** The current time as an ISO string, or the one this action saw the first time. */
export function nowISO(): string {
  if (mode.kind === 'replaying') {
    const next = mode.times.shift()
    if (next !== undefined) return next
    return new Date().toISOString()
  }
  const now = new Date().toISOString()
  if (mode.kind === 'recording') mode.tape.times.push(now)
  return now
}

/** Today as `YYYY-MM-DD`, drawn from the same clock as `nowISO`. */
export function todayISO(): string {
  return nowISO().slice(0, 10)
}

/** Run `fn`, writing down every id and time it is handed. */
export function recording<T>(fn: () => T): { result: T; tape: Tape } {
  if (mode.kind !== 'live') throw new Error('actions do not nest')
  const tape = emptyTape()
  mode = { kind: 'recording', tape }
  try {
    return { result: fn(), tape }
  } finally {
    mode = { kind: 'live' }
  }
}

/** Run `fn`, handing it back what `tape` recorded. The tape itself is not used up. */
export function replaying<T>(tape: Tape, fn: () => T): T {
  if (mode.kind !== 'live') throw new Error('actions do not nest')
  const ids: Partial<Record<IdKind, string[]>> = {}
  for (const [kind, list] of Object.entries(tape.ids) as [IdKind, string[]][]) ids[kind] = [...list]
  mode = { kind: 'replaying', ids, times: [...tape.times] }
  try {
    return fn()
  } finally {
    mode = { kind: 'live' }
  }
}
