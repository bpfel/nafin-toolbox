<script lang="ts">
  import type { WizardData, BudgetAllocation, SavingsProjection } from '../wizardCalculations'
  import { formatCHF } from '../wizardCalculations'

  interface Props {
    data: WizardData
    budget: BudgetAllocation
    projection: SavingsProjection
  }

  let { data, budget, projection }: Props = $props()

  let goalLabel = $derived.by(() => {
    if (data.goal === 'save_goal' && data.goalName) {
      return data.goalName
    }
    if (data.goal === 'invest') return 'investments & savings'
    return 'savings'
  })
</script>

<div class="step">
  <div class="headline">
    <div class="subtitle">In 12 months, you'll save</div>
    <div class="amount">{formatCHF(projection.yearlyTotal)}</div>
    <div class="label">toward {goalLabel}</div>
  </div>

  {#if data.goal === 'save_goal' && data.goalTarget}
    {@const progress = Math.min((projection.yearlyTotal / data.goalTarget) * 100, 100)}
    <div class="goal-progress">
      <div class="progress-bar">
        <div class="fill" style="width: {progress}%"></div>
      </div>
      <div class="progress-labels">
        <span>0</span>
        <span class="target">{formatCHF(data.goalTarget)}</span>
      </div>
      {#if projection.monthsToGoal}
        <div class="eta" class:on-track={projection.onTrack}>
          {#if projection.onTrack}
            You'll reach your goal in {projection.monthsToGoal} months
          {:else}
            At this rate, you'll reach your goal in {projection.monthsToGoal} months
          {/if}
        </div>
      {/if}
    </div>
  {/if}

  <div class="breakdown">
    <div class="row income">
      <span class="label">Monthly income</span>
      <span class="value">{formatCHF(budget.salary)}</span>
    </div>
    <div class="row expenses">
      <span class="label">Monthly expenses</span>
      <span class="value">-{formatCHF(budget.totalExpenses)}</span>
    </div>
    <div class="row savings highlight">
      <span class="label">Monthly savings</span>
      <span class="value">{formatCHF(projection.monthlyContribution)}</span>
    </div>
  </div>

  <div class="details">
    <h4>Budget breakdown</h4>
    <div class="detail-grid">
      <div class="detail-row">
        <span>Rent</span>
        <span>{formatCHF(budget.rent)}</span>
      </div>
      <div class="detail-row">
        <span>Taxes</span>
        <span>{formatCHF(budget.taxes)}</span>
      </div>
      <div class="detail-row">
        <span>Health Insurance</span>
        <span>{formatCHF(budget.healthInsurance)}</span>
      </div>
      <div class="detail-row">
        <span>Food & Groceries</span>
        <span>{formatCHF(budget.food)}</span>
      </div>
      <div class="detail-row">
        <span>Transportation</span>
        <span>{formatCHF(budget.transportation)}</span>
      </div>
      <div class="detail-row">
        <span>Utilities & Telecom</span>
        <span>{formatCHF(budget.utilities + budget.telecom)}</span>
      </div>
      <div class="detail-row">
        <span>Lifestyle</span>
        <span>{formatCHF(budget.clothing + budget.entertainment + budget.diningOut)}</span>
      </div>
      {#if budget.savings > 0}
        <div class="detail-row savings">
          <span>Savings</span>
          <span>{formatCHF(budget.savings)}</span>
        </div>
      {/if}
      {#if budget.investments > 0}
        <div class="detail-row savings">
          <span>Investments</span>
          <span>{formatCHF(budget.investments)}</span>
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .step {
    padding: 0.5rem 0;
  }

  .headline {
    text-align: center;
    margin-bottom: 1.5rem;
  }

  .headline .subtitle {
    font-size: 0.9375rem;
    color: #6c757d;
    margin-bottom: 0.25rem;
  }

  .headline .amount {
    font-size: 2.5rem;
    font-weight: 700;
    color: #2d6a4f;
    line-height: 1.2;
  }

  .headline .label {
    font-size: 0.9375rem;
    color: #6c757d;
  }

  .goal-progress {
    background: #f8f9fa;
    border-radius: 8px;
    padding: 1rem;
    margin-bottom: 1.5rem;
  }

  .progress-bar {
    height: 12px;
    background: #e9ecef;
    border-radius: 6px;
    overflow: hidden;
    margin-bottom: 0.5rem;
  }

  .progress-bar .fill {
    height: 100%;
    background: linear-gradient(90deg, #40916c, #2d6a4f);
    border-radius: 6px;
    transition: width 0.3s ease;
  }

  .progress-labels {
    display: flex;
    justify-content: space-between;
    font-size: 0.75rem;
    color: #adb5bd;
  }

  .progress-labels .target {
    font-weight: 500;
    color: #495057;
  }

  .eta {
    text-align: center;
    font-size: 0.8125rem;
    color: #6c757d;
    margin-top: 0.75rem;
  }

  .eta.on-track {
    color: #2d6a4f;
  }

  .breakdown {
    background: white;
    border: 1px solid #e9ecef;
    border-radius: 8px;
    overflow: hidden;
    margin-bottom: 1rem;
  }

  .breakdown .row {
    display: flex;
    justify-content: space-between;
    padding: 0.75rem 1rem;
    font-size: 0.9375rem;
  }

  .breakdown .row:not(:last-child) {
    border-bottom: 1px solid #f1f3f5;
  }

  .breakdown .row .label {
    color: #495057;
  }

  .breakdown .row .value {
    font-weight: 500;
  }

  .breakdown .row.income .value {
    color: #2d6a4f;
  }

  .breakdown .row.expenses .value {
    color: #e03131;
  }

  .breakdown .row.highlight {
    background: #f8fdf9;
  }

  .breakdown .row.highlight .label {
    font-weight: 500;
  }

  .breakdown .row.highlight .value {
    color: #2d6a4f;
    font-weight: 600;
  }

  .details {
    background: #f8f9fa;
    border-radius: 8px;
    padding: 1rem;
  }

  .details h4 {
    font-size: 0.8125rem;
    font-weight: 600;
    color: #6c757d;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 0.75rem;
  }

  .detail-grid {
    display: grid;
    gap: 0.5rem;
  }

  .detail-row {
    display: flex;
    justify-content: space-between;
    font-size: 0.875rem;
    color: #495057;
  }

  .detail-row span:last-child {
    font-weight: 500;
  }

  .detail-row.savings span:last-child {
    color: #2d6a4f;
  }

  @media (min-width: 640px) {
    .headline .amount {
      font-size: 3rem;
    }

    .detail-grid {
      grid-template-columns: 1fr 1fr;
      gap: 0.5rem 1.5rem;
    }
  }
</style>
