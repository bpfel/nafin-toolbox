<script lang="ts">
  import { t } from '../../lib/i18n/index.svelte'
  import type { PlanSummary } from '../../lib/budget/budgetEngine'
  import Money from '../../lib/util/Money.svelte'

  interface Props {
    summary: PlanSummary
  }

  let { summary }: Props = $props()

  let unallocatedPositive = $derived(Number(summary.plannedBalance) >= 0)
</script>

<div class="summary-bar">
  <div class="summary-grid">
    <div class="summary-item">
      <span class="label">{t('budget.incomeYr')}</span>
      <span class="value income"><Money value={Number(summary.totalPlannedIncome) * 12} /></span>
    </div>
    <div class="summary-item">
      <span class="label">{t('budget.expensesYr')}</span>
      <span class="value expense"><Money value={Number(summary.totalPlannedExpenses) * 12} /></span>
    </div>
    <div class="summary-item">
      <span class="label">{t('budget.unallocatedMo')}</span>
      <span class="value" class:unallocated-positive={unallocatedPositive} class:unallocated-negative={!unallocatedPositive}>
        <Money value={summary.plannedBalance} />
      </span>
    </div>
    <div class="summary-item">
      <span class="label">{t('budget.unallocatedYr')}</span>
      <span class="value" class:unallocated-positive={unallocatedPositive} class:unallocated-negative={!unallocatedPositive}>
        <Money value={Number(summary.plannedBalance) * 12} />
      </span>
    </div>
  </div>
</div>

<style>
  .summary-bar {
    padding: 1rem 1.25rem;
    background: white;
    border-radius: 8px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }
  /* One row of four figures. With the actual column gone there is only one
     reading of the budget, so the planned/actual two-column split went with it. */
  .summary-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 1.5rem;
  }
  .summary-item {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    min-width: 0;
  }
  .label {
    font-size: 0.75rem;
    color: #888;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .value {
    font-size: 1rem;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .income { color: #2d6a4f; }
  .expense { color: #c0392b; }
  .unallocated-positive { color: #2d6a4f; }
  .unallocated-negative { color: #c0392b; }

  @media (max-width: 640px) {
    .summary-bar {
      padding: 0.75rem 1rem;
    }
    .summary-grid {
      grid-template-columns: 1fr 1fr;
      gap: 0.75rem 1rem;
    }
    .value {
      font-size: 0.9rem;
    }
  }
</style>
