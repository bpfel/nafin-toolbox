<script lang="ts">
  import type { BudgetPlanEntry } from '../../lib/api/client'
  import BudgetPlanEntryRow from './BudgetPlanEntryRow.svelte'

  interface Props {
    entries: BudgetPlanEntry[]
    onsave: (categoryId: number, amount: string) => void
  }

  let { entries, onsave }: Props = $props()

  let incomeEntries = $derived(entries.filter(e => e.category_type === 'income'))
  let expenseEntries = $derived(entries.filter(e => e.category_type === 'expense'))
</script>

<div class="plan-table">
  {#if incomeEntries.length > 0}
    <table>
      <thead>
        <tr>
          <th>Income</th>
          <th></th>
          <th class="right">Amount</th>
        </tr>
      </thead>
      <tbody>
        {#each incomeEntries as entry (entry.id)}
          <BudgetPlanEntryRow {entry} {onsave} />
        {/each}
      </tbody>
    </table>
  {/if}

  {#if expenseEntries.length > 0}
    <table>
      <thead>
        <tr>
          <th>Expenses</th>
          <th></th>
          <th class="right">Amount</th>
        </tr>
      </thead>
      <tbody>
        {#each expenseEntries as entry (entry.id)}
          <BudgetPlanEntryRow {entry} {onsave} />
        {/each}
      </tbody>
    </table>
  {/if}
</div>

<style>
  .plan-table {
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
