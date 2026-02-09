<script lang="ts">
  import { deleteBudgetCategory } from '../../lib/api/client'

  interface Props {
    categoryId: number
    categoryName: string
    ondeleted: () => void
    onclose: () => void
  }

  let { categoryId, categoryName, ondeleted, onclose }: Props = $props()

  let deleting = $state(false)
  let error = $state<string | null>(null)

  async function confirm() {
    deleting = true
    error = null
    try {
      await deleteBudgetCategory(categoryId)
      ondeleted()
      onclose()
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to delete'
    } finally {
      deleting = false
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
  <div class="modal" role="dialog" aria-label="Delete category">
    <h3>Delete category</h3>
    <p>Remove <strong>{categoryName}</strong> from your budget? This deletes it from all periods.</p>

    {#if error}
      <p class="error">{error}</p>
    {/if}

    <div class="actions">
      <button class="btn cancel" onclick={onclose} disabled={deleting}>Cancel</button>
      <button class="btn delete" onclick={confirm} disabled={deleting}>
        {deleting ? 'Deleting...' : 'Delete'}
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
    margin: 0 0 0.75rem;
    font-size: 1.1rem;
  }
  p {
    margin: 0 0 1rem;
    color: #555;
    line-height: 1.4;
  }
  .error {
    color: #c0392b;
    font-size: 0.85rem;
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
  .delete {
    background: #c0392b;
    border: none;
    color: white;
  }
  .delete:hover:not(:disabled) {
    background: #a93226;
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
