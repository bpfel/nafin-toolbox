// Per-module collapse state, remembered across reloads.
//
// A user who folds away a module they are not using should not have to fold it
// again on every visit, so the preference outlives the page. localStorage
// rather than the vault: this is a per-device display preference, not financial
// data, and it has to be readable before the vault is unlocked.
//
// Only the *collapsed* ids are stored. Expanded is the default, so a module the
// user has never touched — including every module added after this preference
// was last written — reads as expanded with no migration.
//
// A plain record, not a Set: Svelte 5's `$state` deep-proxies objects and
// arrays but not Map or Set, which would need `svelte/reactivity`. Same
// reasoning as editMode.svelte.ts.

const STORAGE_KEY = 'nafin.collapsedModules'

/**
 * localStorage is not merely empty in some browsers — it throws. Safari private
 * browsing, a full quota, and cookies blocked entirely all raise on access
 * rather than returning null. This runs at import time, so an uncaught throw
 * would take the whole app down before it renders a single pixel.
 *
 * Losing the preference is the right failure mode: every module simply shows.
 */
function load(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return {}
    const state: Record<string, boolean> = {}
    for (const id of parsed) {
      if (typeof id === 'string') state[id] = true
    }
    return state
  } catch {
    return {}
  }
}

const collapsed = $state<Record<string, boolean>>(load())

function persist(): void {
  try {
    const ids = Object.keys(collapsed).filter(id => collapsed[id])
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids))
  } catch {
    // Same bargain as load(): the preference is worth far less than the
    // session. The in-memory state stands for as long as the tab is open.
  }
}

/** Whether the given module's body is shown. Unknown modules default to expanded. */
export function isExpanded(moduleId: string): boolean {
  return collapsed[moduleId] !== true
}

export function toggleExpanded(moduleId: string): void {
  collapsed[moduleId] = !collapsed[moduleId]
  persist()
}
