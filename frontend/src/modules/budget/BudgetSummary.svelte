<script lang="ts">
  import type { BudgetPeriodSummary } from '../../lib/api/client'

  interface Props {
    summary: BudgetPeriodSummary
  }

  let { summary }: Props = $props()

  let balancePositive = $derived(Number(summary.balance) >= 0)

  function fmt(val: string): string {
    return Number(val).toLocaleString('de-CH', { minimumFractionDigits: 2 })
  }
</script>

<div class="summary-bar">
  <div class="summary-item">
    <span class="label">Income</span>
    <span class="value income">CHF {fmt(summary.total_income)}</span>
  </div>
  <div class="summary-item">
    <span class="label">Expenses /mo</span>
    <span class="value expense">CHF {fmt(summary.total_monthly_expenses)}</span>
  </div>
  <div class="summary-item">
    <span class="label">Balance</span>
    <span class="value" class:positive={balancePositive} class:negative={!balancePositive}>
      CHF {fmt(summary.balance)}
    </span>
  </div>
</div>

<style>
  .summary-bar {
    display: flex;
    gap: 1.5rem;
    padding: 1rem 1.25rem;
    background: white;
    border-radius: 8px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }
  .summary-item {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .label {
    font-size: 0.75rem;
    color: #888;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .value {
    font-size: 1.1rem;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .income { color: #2d6a4f; }
  .expense { color: #c0392b; }
  .positive { color: #2d6a4f; }
  .negative { color: #c0392b; }
</style>
