<script lang="ts">
  import { t } from '../../lib/i18n/index.svelte'
  import type { PlanEntryView } from '../../lib/budget/budgetEngine'
  import type { EntryType } from '../../lib/crypto/vault'
  import { isEditing } from '../../lib/util/editMode.svelte'
  import Money from '../../lib/util/Money.svelte'

  interface Props {
    entry: PlanEntryView
    viewMode?: 'monthly' | 'yearly'
    onedit: (
      entryId: string,
      entryName: string,
      entryType: EntryType,
      categoryName: string,
      plannedAmount: string,
    ) => void
  }

  let { entry, viewMode = 'monthly', onedit }: Props = $props()

  // Amounts are read-only here. Changing one is an edit like renaming or
  // reordering is, so it goes through edit mode and the entry dialog -- one
  // way in, rather than a dialog field and a table cell that set the same value.
  let editing = $derived(isEditing('budget'))

  let planned = $derived(Number(entry.plannedAmount))

  function openEditor() {
    onedit(entry.entryId, entry.entryName, entry.entryType, entry.categoryName, entry.plannedAmount)
  }

</script>

<tr
  class="entry-row"
  data-entry-id={entry.entryId}
>
  <td class="name-cell">
    <div class="name-cell-inner">
      {#if editing}
        <span class="drag-handle" aria-label={t('budget.dragToReorder')}>&#x2807;</span>
        <button
          class="name-text"
          onclick={openEditor}
        >
          {entry.entryName}
        </button>
      {:else}
        <!-- Read-only: a button that opens nothing would only invite a click. -->
        <span class="name-text name-static">{entry.entryName}</span>
      {/if}
    </div>
  </td>
  <td class="amount-cell planned-mo-cell">
    {#if editing}
      <button class="cell-value cell-button" onclick={openEditor} aria-label={t('budget.editPlannedMo', { entry: entry.entryName })}>
        <Money value={planned} />
      </button>
    {:else}
      <span class="cell-value"><Money value={planned} /></span>
    {/if}
  </td>
  <td class="amount-cell yearly planned-yr-cell">
    {#if editing}
      <button class="cell-value cell-button" onclick={openEditor} aria-label={t('budget.editPlannedYr', { entry: entry.entryName })}>
        <Money value={planned * 12} />
      </button>
    {:else}
      <span class="cell-value"><Money value={planned * 12} /></span>
    {/if}
  </td>
</tr>

<style>
  .entry-row td {
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid #eee;
    /* Smaller than the category line above, which carries their total. The
       entries are what add up; the line above is the sum. */
    font-size: 0.92rem;
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
    /* Not bold. The only bold thing in a section is the total, so that weight
       means "this is the sum of the lines under it" and nothing else. */
    font-weight: 400;
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
  .amount-cell {
    text-align: right;
    font-variant-numeric: tabular-nums;
    overflow: hidden;
    white-space: nowrap;
    padding: 0.25rem 0.35rem;
  }
  .amount-cell.yearly .cell-value {
    color: var(--ink-faint);
  }
  .cell-value {
    display: block;
    width: 100%;
    padding: 0.25rem 0.5rem;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  /* Reaching for the number you want to change is the obvious move, so in edit
     mode it opens the same dialog the entry name does. Marked the same way,
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

  /* A coarse pointer needs a finger-sized target for the one control the row
     still carries. The handle is a single glyph, so unlike the yearly column it
     costs almost nothing to keep at every width — and hiding it was the reason
     entries could not be reordered on a phone at all. */
  @media (hover: none) and (pointer: coarse) {
    .drag-handle {
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
