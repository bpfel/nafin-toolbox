<script lang="ts">
  import type { BudgetEntry } from '../../lib/api/client'
  import BudgetEntryRow from './BudgetEntryRow.svelte'

  interface Props {
    entries: BudgetEntry[]
    onsave: (categoryId: number, field: 'planned' | 'actual', amount: string) => void
  }

  let { entries, onsave }: Props = $props()

  let incomeEntries = $derived(entries.filter(e => e.category_type === 'income'))
  let expenseEntries = $derived(entries.filter(e => e.category_type === 'expense'))
</script>

<div class="budget-table">
  {#if incomeEntries.length > 0}
    <table>
      <thead>
        <tr>
          <th>Income</th>
          <th class="right">Planned/mo</th>
          <th class="right">Planned/yr</th>
          <th class="right">Actual/mo</th>
        </tr>
      </thead>
      <tbody>
        {#each incomeEntries as entry (entry.id)}
          <BudgetEntryRow {entry} {onsave} />
        {/each}
      </tbody>
    </table>
  {/if}

  {#if expenseEntries.length > 0}
    <table>
      <thead>
        <tr>
          <th>Expenses</th>
          <th class="right">Planned/mo</th>
          <th class="right">Planned/yr</th>
          <th class="right">Actual/mo</th>
        </tr>
      </thead>
      <tbody>
        {#each expenseEntries as entry (entry.id)}
          <BudgetEntryRow {entry} {onsave} />
        {/each}
      </tbody>
    </table>
  {/if}
</div>

<style>
  .budget-table {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    background: white;
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }
  th {
    text-align: left;
    padding: 0.75rem;
    background: #f8f9fa;
    border-bottom: 2px solid #dee2e6;
    font-size: 0.85rem;
    color: #666;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  th.right {
    text-align: right;
  }
</style>
