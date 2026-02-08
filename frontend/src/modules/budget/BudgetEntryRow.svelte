<script lang="ts">
  import type { BudgetEntry } from '../../lib/api/client'

  interface Props {
    entry: BudgetEntry
    onsave: (categoryId: number, field: 'planned' | 'actual', amount: string) => void
    ondelete: (categoryId: number, categoryName: string) => void
    onedit: (categoryId: number, categoryName: string, categoryType: 'income' | 'expense', groupName: string, groupSortOrder: number, fixed: boolean) => void
  }

  let { entry, onsave, ondelete, onedit }: Props = $props()

  const MAX_MONTHLY = 9_999_999_999.99

  let editingField = $state<string | null>(null)
  let editValue = $state('')
  let inputError = $state(false)

  let plannedMonthly = $derived(Number(entry.planned_amount))
  let plannedYearly = $derived(plannedMonthly * 12)
  let actualMonthly = $derived(Number(entry.actual_amount))

  function startEdit(field: string, value: number) {
    editValue = value.toFixed(2)
    editingField = field
    inputError = false
  }

  function save() {
    if (!editingField) return
    const val = Number(editValue)
    if (isNaN(val) || !isFinite(val)) {
      inputError = true
      return
    }

    const monthly = editingField.endsWith('_yr') ? val / 12 : val
    if (Math.abs(monthly) > MAX_MONTHLY) {
      inputError = true
      return
    }

    if (editingField === 'planned_mo') {
      onsave(entry.category_id, 'planned', val.toFixed(2))
    } else if (editingField === 'planned_yr') {
      onsave(entry.category_id, 'planned', (val / 12).toFixed(2))
    } else if (editingField === 'actual_mo') {
      onsave(entry.category_id, 'actual', val.toFixed(2))
    }
    editingField = null
    inputError = false
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') save()
    if (e.key === 'Escape') editingField = null
  }

  function fmt(val: number): string {
    return val.toLocaleString('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }
</script>

<tr
  class="entry-row"
  class:income={entry.category_type === 'income'}
  class:fixed={entry.category_fixed}
  data-category-id={entry.category_id}
>
  <td class="name-cell">
    <span class="drag-handle" aria-label="Drag to reorder">⠿</span>
    <button
      class="name-text"
      onclick={() => onedit(entry.category_id, entry.category_name, entry.category_type as 'income' | 'expense', entry.category_group_name, 0, entry.category_fixed)}
    >
      {entry.category_name}
      {#if entry.category_fixed}
        <span class="fixed-badge">fixed</span>
      {/if}
    </button>
    <button
      class="trash-btn"
      onclick={() => ondelete(entry.category_id, entry.category_name)}
      aria-label="Delete {entry.category_name}"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="3 6 5 6 21 6"></polyline>
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
      </svg>
    </button>
  </td>
  <td class="amount-cell">
    {#if editingField === 'planned_mo'}
      <input
        type="text"
        bind:value={editValue}
        onkeydown={handleKeydown}
        onblur={save}
        class="amount-input" class:input-error={inputError}
      />
    {:else}
      <button class="amount-display" onclick={() => startEdit('planned_mo', plannedMonthly)}>
        {fmt(plannedMonthly)}
      </button>
    {/if}
  </td>
  <td class="amount-cell yearly">
    {#if editingField === 'planned_yr'}
      <input
        type="text"
        bind:value={editValue}
        onkeydown={handleKeydown}
        onblur={save}
        class="amount-input" class:input-error={inputError}
      />
    {:else}
      <button class="amount-display" onclick={() => startEdit('planned_yr', plannedYearly)}>
        {fmt(plannedYearly)}
      </button>
    {/if}
  </td>
  <td class="amount-cell">
    {#if entry.category_fixed}
      <span class="amount-fixed">{fmt(actualMonthly)}</span>
    {:else if editingField === 'actual_mo'}
      <input
        type="text"
        bind:value={editValue}
        onkeydown={handleKeydown}
        onblur={save}
        class="amount-input" class:input-error={inputError}
      />
    {:else}
      <button class="amount-display" onclick={() => startEdit('actual_mo', actualMonthly)}>
        {fmt(actualMonthly)}
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
    display: flex;
    align-items: center;
    gap: 0.35rem;
    overflow: hidden;
    white-space: nowrap;
  }
  .drag-handle {
    cursor: grab;
    color: #ccc;
    font-size: 1rem;
    line-height: 1;
    user-select: none;
    flex-shrink: 0;
  }
  .drag-handle:hover {
    color: #888;
  }
  .name-text {
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1;
    min-width: 0;
    background: none;
    border: none;
    padding: 0;
    text-align: left;
    font-size: inherit;
    color: inherit;
    cursor: pointer;
    border-radius: 3px;
  }
  .name-text:hover {
    text-decoration: underline;
    text-decoration-color: #aaa;
    text-underline-offset: 2px;
  }
  .fixed-badge {
    font-size: 0.7rem;
    color: #888;
    font-style: italic;
    font-weight: 400;
    margin-left: 0.35rem;
  }
  .trash-btn {
    background: none;
    border: none;
    color: #ccc;
    cursor: pointer;
    padding: 0.15rem;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    opacity: 0;
    transition: opacity 0.15s;
  }
  .entry-row:hover .trash-btn {
    opacity: 1;
  }
  .trash-btn:hover {
    color: #c0392b;
  }
  /* Always visible on touch devices */
  @media (hover: none) {
    .trash-btn {
      opacity: 0.6;
    }
  }
  .amount-cell {
    text-align: right;
    font-variant-numeric: tabular-nums;
    overflow: hidden;
    white-space: nowrap;
  }
  .amount-cell.yearly {
    color: #888;
  }
  .amount-fixed {
    display: inline-block;
    padding: 0.25rem 0.5rem;
    color: #888;
    font-style: italic;
    text-align: right;
    width: 100%;
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
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .amount-display:hover {
    border-color: #ccc;
    background: #f8f9fa;
  }
  .amount-input {
    width: 100%;
    max-width: 100%;
    box-sizing: border-box;
    padding: 0.25rem 0.5rem;
    border: 2px solid #2d6a4f;
    border-radius: 4px;
    text-align: right;
    font-size: inherit;
    outline: none;
  }
  .amount-input.input-error {
    border-color: #c0392b;
    background: #fdecea;
  }

  /* Drag ghost styling */
  :global(.drag-ghost) {
    opacity: 0.5;
    background: #e3f2fd !important;
  }
</style>
