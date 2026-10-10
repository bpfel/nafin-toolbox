<script lang="ts">
  import { t, tn } from '../../lib/i18n/index.svelte'
  import * as engine from '../../lib/budget/budgetEngine'
  import type { VaultData } from '../../lib/crypto/vault'
  import { commit } from '../../lib/crypto/vaultStore.svelte'
  import SnapshotEditor from './SnapshotEditor.svelte'
  import DeleteSnapshotModal from './DeleteSnapshotModal.svelte'

  interface Props {
    vault: VaultData
  }

  let { vault }: Props = $props()

  // The engine mutates the vault in place, which runes cannot observe.
  let version = $state(0)

  let panelOpen = $state(false)
  let newName = $state('')
  let snapshotError = $state<string | null>(null)
  let expandedId = $state<string | null>(null)
  let deleteTarget = $state<{ id: string; name: string; lineCount: number } | null>(null)

  let snapshots = $derived(version >= 0 ? engine.listSnapshots(vault) : [])

  function takeSnapshotOfPlan() {
    try {
      // Built here and carried whole, so a replay stores the plan as it was
      // on screen when the button was pressed. See `buildSnapshot`.
      const created = engine.buildSnapshot(vault, newName)
      commit('takeSnapshot', created)
      newName = ''
      snapshotError = null
      expandedId = created.id
      version++
    } catch (e) {
      // The engine refuses an unnamed snapshot. Say so where the name was typed
      // rather than letting the throw escape into the console.
      snapshotError = e instanceof Error ? e.message : t('error.takeSnapshot')
    }
  }

  function handleNameKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault()
      takeSnapshotOfPlan()
    }
  }

  function toggleExpanded(id: string) {
    expandedId = expandedId === id ? null : id
  }

  function renameSnapshot(id: string, name: string) {
    // Deliberately not caught: SnapshotEditor shows the message next to its field.
    commit('renameSnapshot', id, name)
    version++
  }

  function confirmDelete() {
    if (!deleteTarget) return
    commit('deleteSnapshot', deleteTarget.id)
    if (expandedId === deleteTarget.id) expandedId = null
    version++
  }

  function fmtDate(iso: string): string {
    const date = new Date(iso)
    if (isNaN(date.getTime())) return iso
    return date.toLocaleDateString('de-CH', { year: 'numeric', month: 'short', day: 'numeric' })
  }
</script>

<section class="snapshots">
  <button
    class="panel-toggle"
    aria-expanded={panelOpen}
    onclick={() => (panelOpen = !panelOpen)}
  >
    <span class="chevron" class:open={panelOpen} aria-hidden="true">
      <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
        <path d="M4 2 L10 6 L4 10 Z" />
      </svg>
    </span>
    {t('snapshot.panelTitle')}
    <span class="count">{snapshots.length}</span>
  </button>

  {#if panelOpen}
    <div class="panel-body">
      <p class="blurb">
        {t('snapshot.blurb')}
      </p>

      <div class="snapshot-form">
        <label class="name-field">
          <span class="visually-hidden">{t('snapshot.newNameLabel')}</span>
          <input
            type="text"
            placeholder={t('snapshot.newNamePlaceholder')}
            bind:value={newName}
            onkeydown={handleNameKeydown}
          />
        </label>
        <button class="primary" onclick={takeSnapshotOfPlan}>{t('snapshot.create')}</button>
      </div>

      {#if snapshotError}
        <p class="error" role="alert">{snapshotError}</p>
      {/if}

      {#if snapshots.length === 0}
        <p class="empty">{t('snapshot.none')}</p>
      {:else}
        <ul class="snapshot-list">
          {#each snapshots as snapshot (snapshot.id)}
            <li class="snapshot-item">
              <div class="snapshot-head">
                <button
                  class="snapshot-name"
                  aria-expanded={expandedId === snapshot.id}
                  onclick={() => toggleExpanded(snapshot.id)}
                >
                  <span class="chevron" class:open={expandedId === snapshot.id} aria-hidden="true">
                    <svg width="10" height="10" viewBox="0 0 12 12" fill="currentColor">
                      <path d="M4 2 L10 6 L4 10 Z" />
                    </svg>
                  </span>
                  {snapshot.name}
                </button>
                <span class="snapshot-meta">
                  {fmtDate(snapshot.createdAt)} · {snapshot.lines.length}
                  {tn('snapshot.lines', snapshot.lines.length)}
                </span>
                <button
                  class="delete-btn"
                  aria-label={t('snapshot.deleteOne', { name: snapshot.name })}
                  onclick={() =>
                    (deleteTarget = {
                      id: snapshot.id,
                      name: snapshot.name,
                      lineCount: snapshot.lines.length,
                    })}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                  </svg>
                </button>
              </div>

              {#if expandedId === snapshot.id}
                <SnapshotEditor
                  {snapshot}
                  onrename={(name) => renameSnapshot(snapshot.id, name)}
                />
              {/if}
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  {/if}
</section>

{#if deleteTarget}
  <DeleteSnapshotModal
    snapshotName={deleteTarget.name}
    lineCount={deleteTarget.lineCount}
    ondeleted={confirmDelete}
    onclose={() => (deleteTarget = null)}
  />
{/if}

<style>
  .snapshots {
    background: white;
    border-radius: 8px;
    box-shadow: var(--shadow-card);
    overflow: hidden;
  }
  .panel-toggle {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    padding: 0.75rem 1rem;
    background: none;
    border: none;
    font-size: 0.85rem;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #495057;
    cursor: pointer;
    text-align: left;
  }
  .panel-toggle:hover {
    background: #f8f9fa;
  }
  .count {
    font-size: 0.75rem;
    font-weight: 500;
    color: #868e96;
    background: #f1f3f5;
    border-radius: 10px;
    padding: 0.1rem 0.5rem;
    letter-spacing: 0;
  }
  .chevron {
    display: inline-flex;
    align-items: center;
    color: #868e96;
    transition: transform 0.15s;
  }
  .chevron.open {
    transform: rotate(90deg);
  }
  .panel-body {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 0 1rem 1rem;
  }
  .blurb {
    margin: 0;
    font-size: 0.85rem;
    color: #868e96;
    line-height: 1.4;
    max-width: 46rem;
  }
  .snapshot-form {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    flex-wrap: wrap;
  }
  .name-field {
    flex: 1;
    min-width: 12rem;
    display: block;
  }
  .name-field input {
    width: 100%;
    box-sizing: border-box;
    padding: 0.5rem 0.7rem;
    border: 1px solid #ccc;
    border-radius: 6px;
    font-size: 0.95rem;
    outline: none;
  }
  .name-field input:focus {
    border-color: #2d6a4f;
    box-shadow: 0 0 0 2px rgba(45, 106, 79, 0.2);
  }
  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
  .primary {
    background: #2d6a4f;
    color: white;
    border: none;
    border-radius: 6px;
    padding: 0.5rem 1rem;
    font-size: 0.9rem;
    cursor: pointer;
  }
  .primary:hover:not(:disabled) {
    background: #245a42;
  }
  .error {
    color: #c0392b;
    font-size: 0.85rem;
    margin: 0;
    padding: 0.5rem;
    background: #fdecea;
    border-radius: 4px;
  }
  .empty {
    margin: 0;
    color: var(--ink-faint);
    font-size: 0.9rem;
  }
  .snapshot-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
  }
  .snapshot-item {
    border-top: 1px solid var(--rule);
    padding: 0.25rem 0;
  }
  .snapshot-head {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .snapshot-name {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    background: none;
    border: none;
    padding: 0.35rem 0;
    font-size: 0.95rem;
    font-weight: 500;
    color: inherit;
    cursor: pointer;
    text-align: left;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .snapshot-name:hover {
    text-decoration: underline;
    text-decoration-color: #aaa;
    text-underline-offset: 2px;
  }
  .snapshot-meta {
    margin-left: auto;
    font-size: 0.8rem;
    color: #adb5bd;
    white-space: nowrap;
  }
  .delete-btn {
    background: none;
    border: none;
    color: #ccc;
    cursor: pointer;
    padding: 0.25rem;
    display: flex;
    align-items: center;
  }
  .delete-btn:hover {
    color: #c0392b;
  }

  @media (max-width: 480px) {
    .snapshot-meta {
      display: none;
    }
    .name-field input {
      font-size: 16px;
    }
  }
</style>
