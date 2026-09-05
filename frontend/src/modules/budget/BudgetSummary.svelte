<script lang="ts">
  import { t } from '../../lib/i18n/index.svelte'
  import type { PlanSummary } from '../../lib/budget/budgetEngine'
  import Money from '../../lib/util/Money.svelte'

  /**
   * The three things a month of the plan does with money: it arrives, it is
   * spent, or it is kept.
   *
   * The third could not be added up until v7. Savings, bills and purchases were
   * all budgeted as expenses so the zero-based reading still worked, which left
   * "leaves my account but not my net worth" as a figure that existed nowhere —
   * the allocation screen inferred it from routing on every keystroke and then
   * explained the result in a popover.
   */
  interface Props {
    summary: PlanSummary
    /**
     * Which period to show where there is only room for one. Both appear side
     * by side from 768px up, which is also where the toggle that sets this is
     * hidden, because there is width for the pair.
     */
    viewMode?: 'monthly' | 'yearly'
  }

  let { summary, viewMode = 'monthly' }: Props = $props()

  /**
   * Three things the money does, and what is left over having done them.
   *
   * Unallocated is income minus all three, so at zero every franc has a job.
   * It is the only one whose sign matters, hence the only one coloured by its
   * value rather than by what it is.
   */
  let figures = $derived([
    { key: 'income', label: t('budget.income'), amount: summary.totalPlannedIncome },
    { key: 'expense', label: t('budget.expenses'), amount: summary.totalPlannedExpenses },
    { key: 'savings', label: t('budget.savings'), amount: summary.totalPlannedSavings },
    {
      key: 'unallocated',
      label: t('budget.unallocated'),
      amount: summary.plannedBalance,
      signed: true,
    },
  ])
</script>

<div class="summary-bar" class:view-yearly={viewMode === 'yearly'}>
  <div class="summary-grid">
    {#each figures as figure (figure.key)}
      {@const short = figure.signed && Number(figure.amount) < 0}
      <div class="summary-item">
        <span class="label">{figure.label}</span>
        <span class="value monthly {figure.key}" class:short>
          <Money value={figure.amount} />
        </span>
        <span class="value yearly {figure.key}" class:short>
          <Money value={Number(figure.amount) * 12} />
          <span class="per">{t('budget.perYear')}</span>
        </span>
      </div>
    {/each}
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
    color: var(--ink-faint);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .value {
    font-size: 1rem;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  .yearly {
    font-size: 0.85rem;
    font-weight: 500;
    opacity: 0.75;
  }

  .per {
    font-size: 0.7rem;
    font-weight: 400;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  /* Where the money goes, not which type it is. Out keeps the ordinary ink:
     spending is the routine, and colouring the routine spends the one thing
     that could have marked an exception. */
  .income { color: var(--money-in); }
  .expense { color: var(--money-out); }
  .savings { color: var(--money-held); }

  /* The exception, and the only figure here whose sign means something. */
  .unallocated { color: var(--money-in); }
  .unallocated.short { color: var(--alarm); }

  @media (max-width: 767px) {
    .summary-bar {
      padding: 0.75rem 1rem;
    }

    .summary-grid {
      grid-template-columns: 1fr 1fr;
      gap: 0.75rem 1rem;
    }

    /*
     * One period at a time. Six figures do not fit on a phone, and the same
     * toggle that picks a column in the table below picks the figure here —
     * showing both would make that control look as though it had done nothing.
     */
    .yearly {
      display: none;
      font-size: 0.9rem;
      font-weight: 600;
      opacity: 1;
    }

    .view-yearly .monthly {
      display: none;
    }

    .view-yearly .yearly {
      display: inline;
    }

    .per {
      display: none;
    }

    .value {
      font-size: 0.9rem;
    }
  }
</style>
