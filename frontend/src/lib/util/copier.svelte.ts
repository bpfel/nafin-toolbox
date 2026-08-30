// Copy-button state for the screens that show a secret once.
//
// Three of them exist — the vault recovery key, and the 2FA recovery codes in
// both setup and regeneration — and each lays its button out differently: one
// centred under a dashed box, one beside a Download button, one on its own. So
// this holds the state machine and leaves the markup to the caller, rather than
// being a component that would have to be talked out of its own layout.
//
// A factory rather than a module-level singleton like editMode or collapse:
// two of these can be on screen at once, and one saying "Copied" must not make
// the other say it too.

import { copyText } from './clipboard'

/** How long a successful "Copied" label stays before reverting. */
const COPIED_MS = 2500

export function createCopier() {
  let copied = $state(false)
  let failed = $state(false)
  let timer: ReturnType<typeof setTimeout> | undefined

  return {
    /** True briefly after a successful copy — for the button label. */
    get copied() { return copied },
    /** True until the next attempt succeeds — for the copy-it-yourself notice. */
    get failed() { return failed },

    async copy(text: string): Promise<void> {
      const ok = await copyText(text)
      copied = ok
      failed = !ok

      clearTimeout(timer)
      // Success fades, failure does not. These values are shown exactly once, so
      // a user whose copy silently did nothing needs the explanation to stay put.
      if (ok) {
        timer = setTimeout(() => { copied = false }, COPIED_MS)
      }
    },
  }
}
