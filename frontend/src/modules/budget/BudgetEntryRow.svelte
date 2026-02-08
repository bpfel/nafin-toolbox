<script lang="ts">
  import type { BudgetEntry } from '../../lib/api/client'

  interface Props {
    entry: BudgetEntry
    onsave: (categoryId: number, field: 'planned' | 'actual', amount: string) => void
  }

  let { entry, onsave }: Props = $props()

  let editingPlanned = $state(false)
  let editingActual = $state(false)
  let editPlannedValue = $state(entry.planned_amount)
  let editActualValue = $state(entry.actual_amount)

  let variance = $derived(Number(entry.variance))

  function startEditPlanned() {
    editPlannedValue = entry.planned_amount
    editingPlanned = true
  }

  function startEditActual() {
    editActualValue = entry.actual_amount
    editingActual = true
  }

  function savePlanned() {
    onsave(entry.category_id, 'planned', editPlannedValue)
    editingPlanned = false
  }

  function saveActual() {
    onsave(entry.category_id, 'actual', editActualValue)
    editingActual = false
  }

  function handlePlannedKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') savePlanned()
    if (e.key === 'Escape') editingPlanned = false
  }

  function handleActualKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') saveActual()
    if (e.key === 'Escape') editingActual = false
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
    {#if editingPlanned}
      <input
        type="text"
        bind:value={editPlannedValue}
        onkeydown={handlePlannedKeydown}
        onblur={savePlanned}
        class="amount-input"
      />
    {:else}
      <button class="amount-display" onclick={startEditPlanned}>
        {fmt(entry.planned_amount)}
      </button>
    {/if}
  </td>
  <td class="amount-cell">
    {#if editingActual}
      <input
        type="text"
        bind:value={editActualValue}
        onkeydown={handleActualKeydown}
        onblur={saveActual}
        class="amount-input"
      />
    {:else}
      <button class="amount-display" onclick={startEditActual}>
        {fmt(entry.actual_amount)}
      </button>
    {/if}
  </td>
  <td class="amount-cell variance" class:positive={variance >= 0} class:negative={variance < 0}>
    {fmt(entry.variance)}
  </td>
  <td class="monthly-cell">
    {fmt(entry.planned_monthly_equivalent)}
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
  .amount-cell, .monthly-cell {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .variance.positive {
    color: #2d6a4f;
  }
  .variance.negative {
    color: #c0392b;
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
