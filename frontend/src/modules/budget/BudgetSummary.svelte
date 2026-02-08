<script lang="ts">
  import type { BudgetPeriodSummary } from '../../lib/api/client'

  interface Props {
    summary: BudgetPeriodSummary
  }

  let { summary }: Props = $props()

  let plannedBalancePositive = $derived(Number(summary.planned_balance) >= 0)
  let actualBalancePositive = $derived(Number(summary.actual_balance) >= 0)

  function fmt(val: string): string {
    return Number(val).toLocaleString('de-CH', { minimumFractionDigits: 2 })
  }
</script>

<div class="summary-bar">
  {#if summary.plan_name}
    <div class="plan-indicator">
      Plan: {summary.plan_name}
    </div>
  {/if}
  <div class="summary-grid">
    <div class="summary-column">
      <span class="column-header">Planned</span>
      <div class="summary-item">
        <span class="label">Income</span>
        <span class="value income">CHF {fmt(summary.total_planned_income)}</span>
      </div>
      <div class="summary-item">
        <span class="label">Expenses /mo</span>
        <span class="value expense">CHF {fmt(summary.total_planned_monthly)}</span>
      </div>
      <div class="summary-item">
        <span class="label">Balance</span>
        <span class="value" class:positive={plannedBalancePositive} class:negative={!plannedBalancePositive}>
          CHF {fmt(summary.planned_balance)}
        </span>
      </div>
    </div>
    <div class="summary-column">
      <span class="column-header">Actual</span>
      <div class="summary-item">
        <span class="label">Income</span>
        <span class="value income">CHF {fmt(summary.total_actual_income)}</span>
      </div>
      <div class="summary-item">
        <span class="label">Expenses /mo</span>
        <span class="value expense">CHF {fmt(summary.total_actual_monthly)}</span>
      </div>
      <div class="summary-item">
        <span class="label">Balance</span>
        <span class="value" class:positive={actualBalancePositive} class:negative={!actualBalancePositive}>
          CHF {fmt(summary.actual_balance)}
        </span>
      </div>
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
  .plan-indicator {
    font-size: 0.8rem;
    color: #666;
    margin-bottom: 0.75rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid #eee;
  }
  .summary-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1.5rem;
  }
  .column-header {
    display: block;
    font-size: 0.7rem;
    font-weight: 600;
    color: #999;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    margin-bottom: 0.5rem;
  }
  .summary-column {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  .summary-item {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 0.5rem;
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
  .positive { color: #2d6a4f; }
  .negative { color: #c0392b; }
</style>
