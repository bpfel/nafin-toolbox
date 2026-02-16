<script lang="ts">
  import type { PeriodSummary } from '../../lib/budget/budgetEngine'

  interface Props {
    summary: PeriodSummary
  }

  let { summary }: Props = $props()

  let plannedSavingsPositive = $derived(Number(summary.plannedBalance) >= 0)
  let actualSavingsPositive = $derived(Number(summary.actualBalance) >= 0)

  function fmt(val: string): string {
    return Number(val).toLocaleString('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  function fmtYr(val: string): string {
    return (Number(val) * 12).toLocaleString('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }
</script>

<div class="summary-bar">
  <div class="summary-grid">
    <div class="summary-column">
      <span class="column-header">Planned</span>
      <div class="summary-item">
        <span class="label">Income /yr</span>
        <span class="value income">CHF {fmtYr(summary.totalPlannedIncome)}</span>
      </div>
      <div class="summary-item">
        <span class="label">Expenses /yr</span>
        <span class="value expense">CHF {fmtYr(summary.totalPlannedExpenses)}</span>
      </div>
      <div class="summary-item">
        <span class="label">Savings /mo</span>
        <span class="value" class:savings-positive={plannedSavingsPositive} class:savings-negative={!plannedSavingsPositive}>
          CHF {fmt(summary.plannedBalance)}
        </span>
      </div>
      <div class="summary-item">
        <span class="label">Savings /yr</span>
        <span class="value" class:savings-positive={plannedSavingsPositive} class:savings-negative={!plannedSavingsPositive}>
          CHF {fmtYr(summary.plannedBalance)}
        </span>
      </div>
    </div>
    <div class="summary-column">
      <span class="column-header">Actual</span>
      <div class="summary-item">
        <span class="label">Income /yr</span>
        <span class="value income">CHF {fmtYr(summary.totalActualIncome)}</span>
      </div>
      <div class="summary-item">
        <span class="label">Expenses /yr</span>
        <span class="value expense">CHF {fmtYr(summary.totalActualExpenses)}</span>
      </div>
      <div class="summary-item">
        <span class="label">Savings /mo</span>
        <span class="value" class:savings-positive={actualSavingsPositive} class:savings-negative={!actualSavingsPositive}>
          CHF {fmt(summary.actualBalance)}
        </span>
      </div>
      <div class="summary-item">
        <span class="label">Savings /yr</span>
        <span class="value" class:savings-positive={actualSavingsPositive} class:savings-negative={!actualSavingsPositive}>
          CHF {fmtYr(summary.actualBalance)}
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
  .savings-positive { color: #2d6a4f; }
  .savings-negative { color: #c0392b; }

  @media (max-width: 480px) {
    .summary-bar {
      padding: 0.75rem 1rem;
    }
    .summary-grid {
      grid-template-columns: 1fr;
      gap: 1rem;
    }
    .summary-column + .summary-column {
      padding-top: 1rem;
      border-top: 1px solid #eee;
    }
    .value {
      font-size: 0.9rem;
    }
  }
</style>
