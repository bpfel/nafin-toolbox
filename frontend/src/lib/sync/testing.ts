import type { VaultData } from '../crypto/vault'
import { perform, type ActionArgs, type ActionKind, type ActionResult } from './actions'

/**
 * A stand-in for the store's `commit`, for component tests that mock the store.
 *
 * Those tests hand a component a plain vault as a prop and read it back
 * afterwards. The real `commit` would act on the store's own vault instead, so
 * this one applies the same action — through the same `perform` — to whichever
 * vault the test said it is showing. Nothing is queued and nothing is saved.
 *
 *     vi.mock('…/vaultStore.svelte', async () => (await import('…/sync/testing')).storeMock())
 *     render(Component, { props: { vault: committingTo(makeVault()) } })
 */

let target: VaultData | null = null

/** Make `vault` the one commits apply to, and hand it back. */
export function committingTo<V extends VaultData>(vault: V): V {
  target = vault
  return vault
}

export function fakeCommit<K extends ActionKind>(kind: K, ...args: ActionArgs<K>): ActionResult<K> {
  if (!target) throw new Error('committingTo(vault) first: no vault to commit to')
  return perform(target, kind, args).result
}

/** The parts of the store a component that only edits needs. */
export function storeMock() {
  return { commit: fakeCommit }
}

/** For a mock whose vault sits behind a getter: a `commit` that applies to it. */
export function committerFor(vault: () => VaultData | null) {
  return <K extends ActionKind>(kind: K, ...args: ActionArgs<K>): ActionResult<K> => {
    const v = vault()
    if (!v) throw new Error('no vault to commit to')
    return perform(v, kind, args).result
  }
}
