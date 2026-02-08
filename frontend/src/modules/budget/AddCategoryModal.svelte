<script lang="ts">
  import { createBudgetCategory, updateBudgetCategory } from '../../lib/api/client'

  interface Props {
    type: 'income' | 'expense'
    groupName: string
    groupSortOrder: number
    editCategory?: { id: number; name: string; fixed: boolean } | null
    oncreated: () => void
    onclose: () => void
  }

  let { type, groupName, groupSortOrder, editCategory = null, oncreated, onclose }: Props = $props()

  let isEdit = $derived(editCategory != null)
  let name = $state(editCategory?.name ?? '')
  let fixed = $state(editCategory?.fixed ?? false)
  let saving = $state(false)
  let error = $state<string | null>(null)

  async function save() {
    const trimmed = name.trim()
    if (!trimmed) return
    saving = true
    error = null
    try {
      if (isEdit && editCategory) {
        await updateBudgetCategory(editCategory.id, { name: trimmed, fixed })
      } else {
        await createBudgetCategory({
          name: trimmed,
          type,
          group_name: groupName,
          group_sort_order: groupSortOrder,
          fixed,
        })
      }
      oncreated()
      onclose()
    } catch (e) {
      error = e instanceof Error ? e.message : isEdit ? 'Failed to update category' : 'Failed to create category'
    } finally {
      saving = false
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onclose()
  }

  function handleBackdrop(e: MouseEvent) {
    if (e.target === e.currentTarget) onclose()
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div class="backdrop" onclick={handleBackdrop}>
  <div class="modal" role="dialog" aria-label={isEdit ? 'Edit category' : 'Add category'}>
    <h3>{isEdit ? 'Edit' : 'Add'} {type === 'income' ? 'income' : 'expense'} category</h3>
    {#if groupName}
      <p class="group-context">Group: {groupName}</p>
    {/if}

    <label class="field">
      <span class="label">Name</span>
      <input
        type="text"
        bind:value={name}
        placeholder="e.g. Gym membership"
        disabled={saving}
        onkeydown={(e) => { if (e.key === 'Enter' && name.trim()) save() }}
      />
    </label>

    <label class="field checkbox-field">
      <input type="checkbox" bind:checked={fixed} disabled={saving} />
      <span>Fixed amount</span>
      <span class="hint">Actual always equals planned</span>
    </label>

    {#if error}
      <p class="error">{error}</p>
    {/if}

    <div class="actions">
      <button class="btn cancel" onclick={onclose} disabled={saving}>Cancel</button>
      <button class="btn save" onclick={save} disabled={saving || !name.trim()}>
        {saving ? 'Saving...' : isEdit ? 'Save' : 'Add'}
      </button>
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
    max-width: 400px;
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.2);
  }
  h3 {
    margin: 0 0 0.25rem;
    font-size: 1.1rem;
  }
  .group-context {
    margin: 0 0 1rem;
    font-size: 0.85rem;
    color: #666;
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
  .field input[type="text"] {
    padding: 0.6rem 0.75rem;
    border: 1px solid #ccc;
    border-radius: 6px;
    font-size: 1rem;
    outline: none;
  }
  .field input[type="text"]:focus {
    border-color: #2d6a4f;
    box-shadow: 0 0 0 2px rgba(45, 106, 79, 0.2);
  }
  .checkbox-field {
    flex-direction: row;
    align-items: center;
    gap: 0.5rem;
  }
  .checkbox-field input[type="checkbox"] {
    width: 1.1rem;
    height: 1.1rem;
    accent-color: #2d6a4f;
  }
  .hint {
    font-size: 0.8rem;
    color: #888;
  }
  .error {
    color: #c0392b;
    font-size: 0.85rem;
    margin: 0 0 0.75rem;
    padding: 0.5rem;
    background: #fdecea;
    border-radius: 4px;
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
    background: #245a42;
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
