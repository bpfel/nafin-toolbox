<script lang="ts">
  import type { BudgetPlanEntry } from '../../lib/api/client'

  interface Props {
    entry: BudgetPlanEntry
    onsave: (categoryId: number, amount: string) => void
  }

  let { entry, onsave }: Props = $props()

  let editing = $state(false)
  let editValue = $state(entry.amount)

  function startEdit() {
    editValue = entry.amount
    editing = true
  }

  function save() {
    onsave(entry.category_id, editValue)
    editing = false
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') save()
    if (e.key === 'Escape') editing = false
  }

  function fmt(val: string): string {
    return Number(val).toLocaleString('de-CH', { minimumFractionDigits: 2 })
  }
</script>

<tr class="entry-row" class:income={entry.category_type === 'income'}>
  <td class="name-cell">{entry.category_name}</td>
  <td class="freq-cell">
    {#if entry.category_frequency === 'yearly'}
      <span class="freq-badge">yearly</span>
    {/if}
  </td>
  <td class="amount-cell">
    {#if editing}
      <input
        type="text"
        bind:value={editValue}
        onkeydown={handleKeydown}
        onblur={save}
        class="amount-input"
      />
    {:else}
      <button class="amount-display" onclick={startEdit}>
        {fmt(entry.amount)}
      </button>
    {/if}
  </td>
</tr>

<style>
  .entry-row td {
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid #eee;
  }
  .entry-row.income td {
    background: #f0fdf4;
  }
  .name-cell {
    font-weight: 500;
  }
  .freq-badge {
    font-size: 0.7rem;
    padding: 0.1rem 0.4rem;
    background: #e9ecef;
    border-radius: 4px;
    color: #666;
  }
  .amount-cell {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .amount-display {
    background: none;
    border: 1px solid transparent;
    padding: 0.25rem 0.5rem;
    text-align: right;
    width: 100%;
    color: inherit;
    font-size: inherit;
    cursor: pointer;
    border-radius: 4px;
  }
  .amount-display:hover {
    border-color: #ccc;
    background: #f8f9fa;
  }
  .amount-input {
    width: 100px;
    padding: 0.25rem 0.5rem;
    border: 2px solid #2d6a4f;
    border-radius: 4px;
    text-align: right;
    font-size: inherit;
    outline: none;
  }
</style>
