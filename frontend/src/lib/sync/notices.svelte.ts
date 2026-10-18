import type { Action, RefusalCode } from './actions'

/**
 * What saving has to tell the user, beyond "saved".
 *
 * Saving through the queue means a save refused because somebody else saved
 * first no longer stops anything: their vault is fetched and this client's
 * changes are applied on top. Usually that is all, and saying nothing is right.
 * These are the cases where it is not — where something on screen changed
 * under the user, or a change of theirs could not be kept.
 *
 * Two lifetimes. A *toast* reports something that went fine and fades. A
 * *sticky* notice reports something the user lost, and stays until they have
 * read it: a change that disappeared with a message that also disappeared is
 * a change that disappeared silently.
 */

export type Notice =
  /** Other people's changes arrived, and nothing of this user's was lost. */
  | { id: number; kind: 'merged' }
  /** This user's change was saved over a value somebody had just changed. */
  | {
      id: number
      kind: 'overwritten'
      subject: string
      theirs: string
      mine: string
      money: boolean
      /** Puts their value back. */
      undo: Action
    }
  /** Changes that could not be applied, one line each. */
  | { id: number; kind: 'dropped'; items: { subject: string | undefined; reason: RefusalCode }[] }
  /** This account was made a reader while it had changes waiting. */
  | { id: number; kind: 'readOnly'; count: number }
  /** This account is no longer in the household it had changes waiting for. */
  | { id: number; kind: 'removed'; household: string; count: number }
  /** A line just marked as paid automatically — said, with Undo, in case of a slip. */
  | { id: number; kind: 'automatic'; subject: string; undo: Action }
  /** Records kept as Unassigned because their entry was deleted elsewhere. */
  | { id: number; kind: 'unassigned'; count: number }
  /** Signed out under this tab, with changes waiting. */
  | { id: number; kind: 'signedOut'; count: number }

type NewNotice = Notice extends infer N ? (N extends Notice ? Omit<N, 'id'> : never) : never

const TOAST_MS = { merged: 5000, overwritten: 12000, unassigned: 12000, automatic: 8000 } as const

let notices = $state<Notice[]>([])
let nextId = 1

export function getNotices(): Notice[] {
  return notices
}

export function isSticky(notice: Notice): boolean {
  return !(notice.kind in TOAST_MS)
}

export function notify(notice: NewNotice): void {
  // One "updated elsewhere" is enough. Several replays in quick succession
  // would otherwise stack identical lines.
  if (notice.kind === 'merged' && notices.some(n => n.kind === 'merged')) return
  const id = nextId++
  notices = [...notices, { ...notice, id } as Notice]
  const ms = TOAST_MS[notice.kind as keyof typeof TOAST_MS]
  if (ms !== undefined) setTimeout(() => dismiss(id), ms)
}

export function dismiss(id: number): void {
  notices = notices.filter(n => n.id !== id)
}

/** For sign-out, and for tests. */
export function clearNotices(): void {
  notices = []
}
