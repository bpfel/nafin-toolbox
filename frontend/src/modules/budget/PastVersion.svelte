<script lang="ts">
  import { t } from '../../lib/i18n/index.svelte'
  import type { VaultSnapshot } from '../../lib/crypto/vault'
  import { commit } from '../../lib/crypto/vaultStore.svelte'
  import type { PlanVersion } from '../../lib/budget/versions'
  import SnapshotEditor from './SnapshotEditor.svelte'
  import DeleteSnapshotModal from './DeleteSnapshotModal.svelte'

  /**
   * An earlier version of the plan, as it stood: every line, read-only, with
   * the budget's totals — and a name, if somebody gives it one.
   *
   * Below it, any snapshot taken by hand while this was the plan, from before
   * the app kept months. Those can be opened and deleted, and no new ones are
   * made: a month's copy is taken for every month now, which is what they were
   * for.
   */
  interface Props {
    version: PlanVersion
    readOnly: boolean
    onchange: () => void
    /** Under the plan now: only the snapshots taken by hand, no copy to show. */
    savedOnly?: boolean
  }

  let { version, readOnly, onchange, savedOnly = false }: Props = $props()

  let openSaved = $state<string | null>(null)
  let deleting = $state<VaultSnapshot | null>(null)

  function rename(name: string) {
    if (!version.copy) return
    commit('renameSnapshot', version.copy.id, name)
    onchange()
  }

  function remove() {
    if (!deleting) return
    commit('deleteSnapshot', deleting.id)
    deleting = null
    onchange()
  }
</script>

{#if !savedOnly && version.copy}
  <p class="hint">{t('budget.pastVersionHint')}</p>

  <div class="card">
    {#key version.copy.id}
      <SnapshotEditor snapshot={version.copy} onrename={rename} />
    {/key}
  </div>
{/if}

{#if version.saved.length > 0}
  <h3 class="saved-title">{t('budget.alsoSaved')}</h3>
  <ul class="saved">
    {#each version.saved as snapshot (snapshot.id)}
      <li class="card">
        <div class="saved-head">
          <button class="saved-name" aria-expanded={openSaved === snapshot.id} onclick={() => (openSaved = openSaved === snapshot.id ? null : snapshot.id)}>
            {snapshot.name}
          </button>
          {#if !readOnly}
            <button class="bin" aria-label={t('snapshot.deleteOne', { name: snapshot.name })} title={t('snapshot.deleteOne', { name: snapshot.name })} onclick={() => (deleting = snapshot)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            </button>
          {/if}
        </div>
        {#if openSaved === snapshot.id}
          <SnapshotEditor {snapshot} onrename={name => { commit('renameSnapshot', snapshot.id, name); onchange() }} />
        {/if}
      </li>
    {/each}
  </ul>
{/if}

{#if deleting}
  <DeleteSnapshotModal
    snapshotName={deleting.name}
    lineCount={deleting.lines.length}
    ondeleted={remove}
    onclose={() => (deleting = null)}
  />
{/if}

<style>
  .hint {
    margin: 0 0 0.75rem;
    font-size: 0.85rem;
    color: var(--ink-faint);
    text-align: center;
  }

  .card {
    background: var(--surface);
    border-radius: 8px;
    box-shadow: var(--shadow-card);
    padding: 0.75rem 1rem;
  }

  .saved-title {
    margin: 1.25rem 0 0.5rem;
    font-size: 0.9rem;
    color: var(--ink-faint);
  }

  .saved {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .saved-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .saved-name {
    flex: 1 1 auto;
    padding: 0.4rem 0;
    border: none;
    background: none;
    color: inherit;
    font: inherit;
    font-weight: 500;
    text-align: left;
    cursor: pointer;
  }

  .bin {
    width: 40px;
    height: 40px;
    padding: 0;
    border: none;
    background: none;
    color: var(--alarm);
    cursor: pointer;
  }

  .bin svg {
    width: 18px;
    height: 18px;
  }
</style>
