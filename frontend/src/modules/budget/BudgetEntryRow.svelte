<script lang="ts">
  import type { PlanEntryView } from '../../lib/budget/budgetEngine'
  import { isEditing } from '../../lib/util/editMode.svelte'

  interface Props {
    entry: PlanEntryView
    viewMode?: 'monthly' | 'yearly'
    ondelete: (categoryId: string, categoryName: string) => void
    onedit: (categoryId: string, categoryName: string, categoryType: 'income' | 'expense', groupName: string, plannedAmount: string) => void
  }

  let { entry, viewMode = 'monthly', ondelete, onedit }: Props = $props()

  // Amounts are read-only here. Changing one is an edit like renaming or
  // reordering is, so it goes through edit mode and the category dialog -- one
  // way in, rather than a dialog field and a table cell that set the same value.
  let editing = $derived(isEditing('budget'))

  let planned = $derived(Number(entry.plannedAmount))

  function openEditor() {
    onedit(entry.categoryId, entry.categoryName, entry.categoryType, entry.categoryGroupName, entry.plannedAmount)
  }

  function fmt(val: number): string {
    return val.toLocaleString('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

</script>

<tr
  class="entry-row"
  class:income={entry.categoryType === 'income'}
  data-category-id={entry.categoryId}
>
  <td class="name-cell">
    <div class="name-cell-inner">
      {#if editing}
        <span class="drag-handle" aria-label="Drag to reorder">&#x2807;</span>
        <button
          class="name-text"
          onclick={openEditor}
        >
          {entry.categoryName}
        </button>
        <button
          class="trash-btn"
          onclick={() => ondelete(entry.categoryId, entry.categoryName)}
          aria-label="Delete {entry.categoryName}"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
      {:else}
        <!-- Read-only: a button that opens nothing would only invite a click. -->
        <span class="name-text name-static">{entry.categoryName}</span>
      {/if}
    </div>
  </td>
  <td class="amount-cell planned-mo-cell">
    {#if editing}
      <button class="cell-value cell-button" onclick={openEditor} aria-label="Edit planned per month for {entry.categoryName}">
        {fmt(planned)}
      </button>
    {:else}
      <span class="cell-value">{fmt(planned)}</span>
    {/if}
  </td>
  <td class="amount-cell yearly planned-yr-cell">
    {#if editing}
      <button class="cell-value cell-button" onclick={openEditor} aria-label="Edit planned per year for {entry.categoryName}">
        {fmt(planned * 12)}
      </button>
    {:else}
      <span class="cell-value">{fmt(planned * 12)}</span>
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
    overflow: hidden;
    white-space: nowrap;
  }
  .name-cell-inner {
    display: flex;
    align-items: center;
    gap: 0.35rem;
  }
  .drag-handle {
    cursor: grab;
    color: #adb5bd;
    font-size: 1rem;
    line-height: 1;
    user-select: none;
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: color 0.15s;
  }
  .drag-handle:hover {
    color: #495057;
  }
  .drag-handle:active {
    cursor: grabbing;
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
  /* Same box, none of the invitations to click it. */
  .name-static {
    cursor: default;
  }
  .name-static:hover {
    text-decoration: none;
  }
  /* Rendered only in edit mode, so it is already hidden when it would be noise.
     Fading it in on row hover made it unreachable on a touchscreen — the one
     input where edit mode is the only signal you have.

     Below 768px there is no width for it and it drops out entirely; deleting
     happens from the category dialog there, which the whole row opens. */
  .trash-btn {
    background: none;
    border: none;
    color: #adb5bd;
    cursor: pointer;
    padding: 0.15rem;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    transition: color 0.15s;
  }
  .trash-btn:hover {
    color: #c0392b;
  }
  .trash-btn:focus-visible {
    outline: 2px solid #c0392b;
    outline-offset: 2px;
    border-radius: 4px;
    color: #c0392b;
  }
  .amount-cell {
    text-align: right;
    font-variant-numeric: tabular-nums;
    overflow: hidden;
    white-space: nowrap;
    padding: 0.25rem 0.35rem;
  }
  .amount-cell.yearly .cell-value {
    color: #888;
  }
  .cell-value {
    display: block;
    width: 100%;
    padding: 0.25rem 0.5rem;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  /* Reaching for the number you want to change is the obvious move, so in edit
     mode it opens the same dialog the category name does. Marked the same way,
     because it means the same thing. */
  .cell-button {
    background: none;
    border: none;
    font-size: inherit;
    font-family: inherit;
    color: inherit;
    cursor: pointer;
    border-radius: 3px;
  }
  .cell-button:hover {
    text-decoration: underline;
    text-decoration-color: #aaa;
    text-underline-offset: 2px;
  }
  .cell-button:focus-visible {
    outline: 2px solid #2d6a4f;
    outline-offset: -2px;
  }

  :global(.drag-ghost) {
    opacity: 0.5;
    background: #e3f2fd !important;
  }

  /* Wide touchscreens keep both controls (the narrow-screen rules below drop
     them in favour of long-press), so they need finger-sized targets. */
  @media (hover: none) and (pointer: coarse) {
    .drag-handle,
    .trash-btn {
      min-width: 32px;
      min-height: 32px;
      justify-content: center;
    }
  }

  @media (max-width: 768px) {
    .entry-row td {
      padding: 0.4rem 0.5rem;
    }
    .cell-value {
      padding: 0.2rem 0.35rem;
    }
    .amount-cell {
      padding: 0.2rem 0.25rem;
    }
    .drag-handle {
      display: none;
    }
    .trash-btn {
      display: none;
    }
    .planned-yr-cell {
      display: none;
    }
    :global(.view-yearly .planned-mo-cell) {
      display: none;
    }
    :global(.view-yearly .planned-yr-cell) {
      display: table-cell;
    }
  }
</style>
