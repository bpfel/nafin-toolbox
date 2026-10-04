// The back gesture closes whatever is open over the screen, before it moves
// the screen.
//
// Installed to the home screen the app has no browser toolbar, so on Android
// the system back gesture is the only back there is. It walks the history, and
// a dialog has never been in the history: back used to change the screen
// *under* an open dialog and leave the dialog standing.
//
// So a dialog leaves a step of its own. Opening one pushes an entry with the
// same address, marked with the dialog's id; back pops it, and the dialog
// closes. Closing it any other way — Cancel, Escape, the backdrop — takes the
// step back out, so a dialog opened and dismissed five times does not leave
// five dead presses of the back button behind it.
//
// This is the "anything deeper is a modal" half of the two-levels rule in
// router.svelte.ts: a modal is in the history, but never in the address.

const MARK = 'nafinLayer'

/** The ids of the dialog steps that are in the history right now, oldest first. */
const stack: number[] = []

/** What each open dialog does to close itself, by id. */
const open = new Map<number, () => void>()

let nextId = 1

/** Steps to take back at the end of this task, batched — see `scheduleBack`. */
let scheduled = 0

/** Traversals this module started that have not landed yet. */
let pending = 0

/** Work waiting for those traversals, run once the last one lands. */
const waiting: (() => void)[] = []

let listening = false

function layerOf(state: unknown): number {
  const id = (state as Record<string, unknown> | null)?.[MARK]
  return typeof id === 'number' ? id : 0
}

/**
 * Takes `n` steps back, once, at the end of the current task.
 *
 * Batched because closing a sheet that has a dialog open on top of it destroys
 * both at once, and two `history.back()` calls in a row are not reliably two
 * steps — browsers may run only one. One `go(-2)` is.
 */
function scheduleBack(n: number): void {
  if (scheduled === 0) {
    queueMicrotask(() => {
      const steps = scheduled
      scheduled = 0
      pending++
      window.history.go(-steps)
    })
  }
  scheduled += n
}

function onPopState(): void {
  if (pending > 0) {
    // One of ours. The dialog it was for is already gone.
    pending--
    if (pending === 0 && scheduled === 0) waiting.splice(0).forEach((run) => run())
    return
  }

  // The user's. Everything above the step they landed on closes, newest
  // first, so a dialog over a sheet goes before the sheet does.
  const top = layerOf(window.history.state)
  while (stack.length > 0 && stack[stack.length - 1] > top) {
    const id = stack.pop()!
    const close = open.get(id)
    open.delete(id)
    close?.()
  }
}

function listen(): void {
  if (listening) return
  window.addEventListener('popstate', onPopState)
  listening = true
}

/**
 * Runs `go` once no dialog steps are left in the history — taking them out
 * first if there are any.
 *
 * For the router. A button inside a dialog that goes somewhere else closes the
 * dialog and navigates in one handler; the new screen has to replace the
 * screen the dialog was opened over, not sit on top of a step that names a
 * dialog which no longer exists.
 */
export function leaveLayers(go: () => void): void {
  if (stack.length > 0) {
    scheduleBack(stack.length)
    stack.length = 0
    open.clear()
  }
  if (pending === 0 && scheduled === 0) go()
  else waiting.push(go)
}

/**
 * `use:closeOnBack={onclose}` on a dialog's root element.
 *
 * `onclose` is what the dialog's own Cancel button calls. It is the parent's
 * business what closing means; this only decides when.
 */
export function closeOnBack(_node: HTMLElement, onclose: () => void) {
  listen()
  const id = nextId++
  let close = onclose

  open.set(id, () => close())

  // One dialog handing over to another — an edit form opening its delete
  // confirmation — closes the first and opens the second in the same tick.
  // Pushed straight away, the second step would be the one the first's
  // pending `go(-1)` took back out. So it waits for that to land.
  const enter = () => {
    if (!open.has(id)) return
    stack.push(id)
    window.history.pushState({ [MARK]: id }, '', window.location.href)
  }
  if (pending === 0 && scheduled === 0) enter()
  else waiting.push(enter)

  return {
    update(next: () => void) {
      close = next
    },
    destroy() {
      // Gone already if the back gesture is what closed it, or if a
      // navigation cleared it out.
      if (!open.delete(id)) return
      const at = stack.indexOf(id)
      if (at < 0) return
      const steps = stack.length - at
      stack.length = at
      // Anything opened over this one goes with it; its own destroy will find
      // nothing left to do.
      scheduleBack(steps)
    },
  }
}
