// Per-module edit mode.
//
// A module is read-only by default. Structural affordances — drag handles, add
// buttons, delete buttons — only appear once the module is put into edit mode
// from the button beside its name.
//
// Why a shared store rather than props: the affordances live several levels down
// (a budget row is inside a table inside the module), while the toggle lives in
// App.svelte beside the module heading. Threading a boolean through every layer
// would touch components that otherwise have no interest in it.
//
// Keyed by module id so each module is independent — putting the budget into
// edit mode must not unlock the accounts screen.
//
// A plain record, not a Set: Svelte 5's `$state` deep-proxies objects and arrays
// but not Map or Set, which would need `svelte/reactivity`. A record is reactive
// with no extra import and no trap for the next person.
const editing = $state<Record<string, boolean>>({})

/** Whether the given module is currently editable. Defaults to false. */
export function isEditing(moduleId: string): boolean {
  return editing[moduleId] === true
}

export function toggleEditing(moduleId: string): void {
  editing[moduleId] = !editing[moduleId]
}

/**
 * Leaves edit mode for every module.
 *
 * Called on logout: edit mode is a transient UI state, and the next person to
 * sign in should not inherit an unlocked module from the last session.
 */
export function clearEditing(): void {
  for (const key of Object.keys(editing)) {
    delete editing[key]
  }
}
