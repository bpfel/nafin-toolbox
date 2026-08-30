<script lang="ts">
  import { untrack } from 'svelte'
  import type { VaultCategory, VaultData } from '../../lib/crypto/vault'
  import * as engine from '../../lib/budget/budgetEngine'
  import { focusTrap } from '../../lib/util/focusTrap'

  interface Props {
    category: VaultCategory
    vault: VaultData
    onsaved: () => void
    onclose: () => void
  }

  let { category, vault, onsaved, onclose }: Props = $props()

  // Seeded once: the dialog is created fresh each time it opens.
  let name = $state(untrack(() => category.name))
  let type = $state<'income' | 'expense'>(untrack(() => category.type))
  let error = $state<string | null>(null)

  let trimmed = $derived(name.trim())
  let members = $derived(engine.entriesInCategory(vault, category.id))
  let movingSides = $derived(type !== category.type)

  // A reserve is an expense idea — it says money is being set aside towards a
  // target. updateEntry drops it on the way to income, so say so first.
  let reservesLost = $derived(
    movingSides && type === 'income' ? members.filter(c => c.reserve).length : 0,
  )

  let conflict = $derived(
    trimmed === '' ? null : engine.findCategoryConflict(vault, category.id, trimmed, type),
  )

  let changed = $derived(trimmed !== category.name || movingSides)

  function save() {
    error = null
    try {
      engine.updateCategory(vault, category.id, { name: trimmed, type })
      onsaved()
      onclose()
    } catch (e) {
      error = e instanceof Error ? e.message : 'could not save this category'
    }
  }

  function merge() {
    if (!conflict) return
    engine.mergeCategory(vault, category.id, conflict.id)
    onsaved()
    onclose()
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onclose()
  }

  function handleBackdrop(e: MouseEvent) {
    if (e.target === e.currentTarget) onclose()
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="backdrop" role="presentation" onclick={handleBackdrop}>
  <div class="modal" role="dialog" aria-label="Edit category" use:focusTrap>
    <h3>Edit category</h3>

    <label class="field">
      <span class="label">Name</span>
      <input type="text" bind:value={name} onkeydown={(e) => e.key === 'Enter' && !conflict && save()} />
    </label>

    <label class="field">
      <span class="label">Type</span>
      <select bind:value={type}>
        <option value="income">Income</option>
        <option value="expense">Expense</option>
      </select>
    </label>

    {#if movingSides}
      <div class="notice">
        <p>
          Moving this category to {type} takes its {members.length}
          {members.length === 1 ? 'entry' : 'entries'} with it. Their account
          routing resets to the default.
          {#if reservesLost > 0}
            {reservesLost}
            {reservesLost === 1 ? 'reserve is' : 'reserves are'} removed: setting money
            aside towards a target is something only an expense does.
          {/if}
        </p>
      </div>
    {/if}

    {#if conflict}
      <div class="notice">
        <p>
          A{type === 'income' ? 'n' : ''} {type} category called <strong>{conflict.name}</strong>
          already exists. Two categories cannot share a name on the same side of the budget.
        </p>
        <p>
          Merging moves this category's {members.length}
          {members.length === 1 ? 'entry' : 'entries'} into it and removes
          <strong>{category.name}</strong>.
        </p>
      </div>
    {/if}

    {#if error}
      <p class="error" role="alert">{error}</p>
    {/if}

    <div class="actions">
      <button class="btn cancel" onclick={onclose}>Cancel</button>
      {#if conflict}
        <button class="btn merge" onclick={merge}>Merge into {conflict.name}</button>
      {:else}
        <button class="btn save" onclick={save} disabled={!changed || trimmed === ''}>Save</button>
      {/if}
    </div>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    padding: 1rem;
  }
  .modal {
    background: white;
    border-radius: 12px;
    padding: 1.5rem;
    width: 100%;
    max-width: 440px;
    max-height: 90vh;
    overflow-y: auto;
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.2);
  }
  h3 {
    margin: 0 0 1rem;
    font-size: 1.1rem;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    margin-bottom: 1rem;
  }
  .label {
    font-size: 0.85rem;
    font-weight: 500;
    color: #333;
  }
  .field input,
  .field select {
    padding: 0.6rem 0.75rem;
    border: 1px solid #ccc;
    border-radius: 6px;
    font-size: 1rem;
    outline: none;
  }
  .field input:focus,
  .field select:focus {
    border-color: #2d6a4f;
    box-shadow: 0 0 0 2px rgba(45, 106, 79, 0.2);
  }
  .notice {
    background: #fff8e6;
    border: 1px solid #f0e0b0;
    border-radius: 6px;
    padding: 0.75rem;
    margin-bottom: 1rem;
  }
  .notice p {
    margin: 0;
    font-size: 0.85rem;
    color: #6b5518;
    line-height: 1.4;
  }
  .notice p + p {
    margin-top: 0.5rem;
  }
  .error {
    color: #c0392b;
    font-size: 0.85rem;
    padding: 0.4rem 0.6rem;
    background: #fdecea;
    border-radius: 6px;
    margin: 0 0 1rem;
  }
  .actions {
    display: flex;
    gap: 0.75rem;
    justify-content: flex-end;
  }
  .btn {
    padding: 0.5rem 1.25rem;
    border-radius: 6px;
    font-size: 0.9rem;
    cursor: pointer;
  }
  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .cancel {
    background: #f1f3f5;
    border: 1px solid #dee2e6;
    color: #333;
  }
  .cancel:hover:not(:disabled) {
    background: #e9ecef;
  }
  .save {
    background: #2d6a4f;
    border: none;
    color: white;
  }
  .save:hover:not(:disabled) {
    background: #245741;
  }
  .merge {
    background: #b26a00;
    border: none;
    color: white;
  }
  .merge:hover:not(:disabled) {
    background: #925700;
  }

  @media (max-width: 480px) {
    .backdrop {
      align-items: flex-end;
      padding: 0;
    }
    .modal {
      max-width: 100%;
      border-radius: 16px 16px 0 0;
      padding: 1.5rem 1.25rem 2rem;
    }
  }
</style>
