<script lang="ts">
  import type { BudgetEntry } from '../../lib/api/client'

  interface Props {
    entry: BudgetEntry
    onsave: (categoryId: number, field: 'planned' | 'actual', amount: string) => void
  }

  let { entry, onsave }: Props = $props()

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

    // Convert to monthly value for range check
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

<tr class="entry-row" class:income={entry.category_type === 'income'}>
  <td class="name-cell">{entry.category_name}</td>
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
    {#if editingField === 'actual_mo'}
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
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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
</style>
