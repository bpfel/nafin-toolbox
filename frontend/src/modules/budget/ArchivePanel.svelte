<script lang="ts">
  import * as engine from '../../lib/budget/budgetEngine'
  import type { VaultData } from '../../lib/crypto/vault'
  import { markDirty } from '../../lib/crypto/vaultStore.svelte'
  import ArchiveEditor from './ArchiveEditor.svelte'
  import DeleteArchiveModal from './DeleteArchiveModal.svelte'

  interface Props {
    vault: VaultData
  }

  let { vault }: Props = $props()

  // The engine mutates the vault in place, which runes cannot observe.
  let version = $state(0)

  let panelOpen = $state(false)
  let newName = $state('')
  let archiveError = $state<string | null>(null)
  let expandedId = $state<string | null>(null)
  let deleteTarget = $state<{ id: string; name: string; lineCount: number } | null>(null)

  let archives = $derived(version >= 0 ? engine.listArchives(vault) : [])

  function archiveCurrentPlan() {
    try {
      const created = engine.archivePlan(vault, newName)
      newName = ''
      archiveError = null
      expandedId = created.id
      markDirty()
      version++
    } catch (e) {
      // The engine refuses an unnamed archive. Say so where the name was typed
      // rather than letting the throw escape into the console.
      archiveError = e instanceof Error ? e.message : 'could not archive the plan'
    }
  }

  function handleNameKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault()
      archiveCurrentPlan()
    }
  }

  function toggleExpanded(id: string) {
    expandedId = expandedId === id ? null : id
  }

  function renameArchive(id: string, name: string) {
    // Deliberately not caught: ArchiveEditor shows the message next to its field.
    engine.renameArchive(vault, id, name)
    markDirty()
    version++
  }

  function updateLine(id: string, lineIndex: number, amount: string) {
    engine.updateArchiveLine(vault, id, lineIndex, amount)
    markDirty()
    version++
  }

  function confirmDelete() {
    if (!deleteTarget) return
    engine.deleteArchive(vault, deleteTarget.id)
    if (expandedId === deleteTarget.id) expandedId = null
    markDirty()
    version++
  }

  function fmtDate(iso: string): string {
    const date = new Date(iso)
    if (isNaN(date.getTime())) return iso
    return date.toLocaleDateString('de-CH', { year: 'numeric', month: 'short', day: 'numeric' })
  }
</script>

<section class="archives">
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
    Archives
    <span class="count">{archives.length}</span>
  </button>

  {#if panelOpen}
    <div class="panel-body">
      <p class="blurb">
        An archive is a named copy of the plan as it stands now. It keeps the names
        and amounts it was taken with, so later edits to your categories leave it
        alone.
      </p>

      <div class="archive-form">
        <label class="name-field">
          <span class="visually-hidden">Name for the new archive</span>
          <input
            type="text"
            placeholder="e.g. Before the raise"
            bind:value={newName}
            onkeydown={handleNameKeydown}
          />
        </label>
        <button class="primary" onclick={archiveCurrentPlan}>Archive current plan</button>
      </div>

      {#if archiveError}
        <p class="error" role="alert">{archiveError}</p>
      {/if}

      {#if archives.length === 0}
        <p class="empty">No archives yet.</p>
      {:else}
        <ul class="archive-list">
          {#each archives as archive (archive.id)}
            <li class="archive-item">
              <div class="archive-head">
                <button
                  class="archive-name"
                  aria-expanded={expandedId === archive.id}
                  onclick={() => toggleExpanded(archive.id)}
                >
                  <span class="chevron" class:open={expandedId === archive.id} aria-hidden="true">
                    <svg width="10" height="10" viewBox="0 0 12 12" fill="currentColor">
                      <path d="M4 2 L10 6 L4 10 Z" />
                    </svg>
                  </span>
                  {archive.name}
                </button>
                <span class="archive-meta">
                  {fmtDate(archive.createdAt)} · {archive.lines.length}
                  {archive.lines.length === 1 ? 'line' : 'lines'}
                </span>
                <button
                  class="delete-btn"
                  aria-label="Delete archive {archive.name}"
                  onclick={() =>
                    (deleteTarget = {
                      id: archive.id,
                      name: archive.name,
                      lineCount: archive.lines.length,
                    })}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                  </svg>
                </button>
              </div>

              {#if expandedId === archive.id}
                <ArchiveEditor
                  {archive}
                  onrename={(name) => renameArchive(archive.id, name)}
                  onamountchange={(lineIndex, amount) => updateLine(archive.id, lineIndex, amount)}
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
  <DeleteArchiveModal
    archiveName={deleteTarget.name}
    lineCount={deleteTarget.lineCount}
    ondeleted={confirmDelete}
    onclose={() => (deleteTarget = null)}
  />
{/if}

<style>
  .archives {
    background: white;
    border-radius: 8px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
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
    font-weight: 600;
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
    font-weight: 600;
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
  .archive-form {
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
    color: #888;
    font-size: 0.9rem;
  }
  .archive-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
  }
  .archive-item {
    border-top: 1px solid #eee;
    padding: 0.25rem 0;
  }
  .archive-head {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .archive-name {
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
  .archive-name:hover {
    text-decoration: underline;
    text-decoration-color: #aaa;
    text-underline-offset: 2px;
  }
  .archive-meta {
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
    .archive-meta {
      display: none;
    }
    .name-field input {
      font-size: 16px;
    }
  }
</style>
