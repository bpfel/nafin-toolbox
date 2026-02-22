<script lang="ts">
  import { formatCHF } from '../wizardCalculations'
  import type { WizardData } from '../wizardCalculations'

  interface Props {
    goal?: WizardData['goal']
    investmentRisk?: WizardData['investmentRisk']
    savingsRate?: number
    goalName?: string
    goalTarget?: number
    goalMonths?: number
    onchange: (data: Partial<WizardData>) => void
  }

  let {
    goal,
    investmentRisk,
    savingsRate,
    goalName,
    goalTarget,
    goalMonths,
    onchange,
  }: Props = $props()

  function selectGoal(g: WizardData['goal']) {
    onchange({ goal: g })
  }

  function handleRiskChange(risk: WizardData['investmentRisk']) {
    onchange({ investmentRisk: risk })
  }

  function handleGoalNameChange(e: Event) {
    const target = e.target as HTMLInputElement
    onchange({ goalName: target.value })
  }

  function handleGoalTargetChange(e: Event) {
    const target = e.target as HTMLInputElement
    onchange({ goalTarget: parseFloat(target.value) || 0 })
  }

  function handleGoalMonthsChange(e: Event) {
    const target = e.target as HTMLInputElement
    onchange({ goalMonths: parseInt(target.value, 10) || 0 })
  }

  const goals = [
    {
      id: 'invest' as const,
      icon: '',
      title: 'Grow Wealth',
      description: 'Focus on investments for long-term growth',
    },
    {
      id: 'save' as const,
      icon: '',
      title: 'Build Savings',
      description: 'Prioritize liquid savings and emergency fund',
    },
    {
      id: 'save_goal' as const,
      icon: '',
      title: 'Save for a Goal',
      description: 'Target a specific amount by a deadline',
    },
  ]
</script>

<div class="step">
  <h2>What's your financial goal?</h2>
  <p>This determines how we split your savings</p>

  <div class="goals">
    {#each goals as g}
      <button
        class="goal-card"
        class:selected={goal === g.id}
        onclick={() => selectGoal(g.id)}
      >
        <span class="icon">{g.icon}</span>
        <div class="content">
          <h3>{g.title}</h3>
          <p>{g.description}</p>
        </div>
      </button>
    {/each}
  </div>

  {#if goal === 'invest'}
    <div class="follow-up">
      <span class="label-text">Investment approach</span>
      <div class="risk-options">
        <button
          class:selected={investmentRisk === 'conservative'}
          onclick={() => handleRiskChange('conservative')}
        >
          Conservative
        </button>
        <button
          class:selected={investmentRisk === 'balanced'}
          onclick={() => handleRiskChange('balanced')}
        >
          Balanced
        </button>
        <button
          class:selected={investmentRisk === 'aggressive'}
          onclick={() => handleRiskChange('aggressive')}
        >
          Aggressive
        </button>
      </div>
    </div>
  {/if}

  {#if goal === 'save_goal'}
    <div class="follow-up goal-details">
      <div class="field">
        <label for="goalName">What are you saving for?</label>
        <input
          id="goalName"
          type="text"
          placeholder="e.g., Emergency fund, Vacation, Car"
          value={goalName ?? ''}
          oninput={handleGoalNameChange}
        />
      </div>
      <div class="field-row">
        <div class="field">
          <label for="goalTarget">Target amount</label>
          <div class="input-with-prefix">
            <span>CHF</span>
            <input
              id="goalTarget"
              type="number"
              placeholder="10000"
              value={goalTarget ?? ''}
              oninput={handleGoalTargetChange}
              min="100"
            />
          </div>
        </div>
        <div class="field">
          <label for="goalMonths">Timeframe</label>
          <div class="input-with-suffix">
            <input
              id="goalMonths"
              type="number"
              placeholder="12"
              value={goalMonths ?? ''}
              oninput={handleGoalMonthsChange}
              min="1"
              max="120"
            />
            <span>months</span>
          </div>
        </div>
      </div>
      {#if goalTarget && goalMonths}
        <div class="calculation">
          Monthly contribution needed: <strong>{formatCHF(Math.ceil(goalTarget / goalMonths))}</strong>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .step {
    padding: 1rem 0;
  }

  h2 {
    font-size: 1.25rem;
    font-weight: 600;
    margin-bottom: 0.5rem;
    color: #212529;
    text-align: center;
  }

  p {
    color: #6c757d;
    margin-bottom: 1.5rem;
    text-align: center;
    font-size: 0.9375rem;
  }

  .goals {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    margin-bottom: 1.5rem;
  }

  .goal-card {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    padding: 1rem;
    background: white;
    border: 2px solid #e9ecef;
    border-radius: 10px;
    text-align: left;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .goal-card:hover {
    border-color: #ced4da;
  }

  .goal-card.selected {
    border-color: #2d6a4f;
    background: #f8fdf9;
  }

  .goal-card .icon {
    font-size: 1.5rem;
    flex-shrink: 0;
  }

  .goal-card .content h3 {
    font-size: 0.9375rem;
    font-weight: 600;
    margin-bottom: 0.125rem;
    color: #212529;
  }

  .goal-card .content p {
    font-size: 0.8125rem;
    color: #6c757d;
    margin: 0;
    text-align: left;
  }

  .follow-up {
    background: #f8f9fa;
    border-radius: 8px;
    padding: 1rem;
    animation: slideDown 0.2s ease;
  }

  @keyframes slideDown {
    from {
      opacity: 0;
      transform: translateY(-10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .follow-up label,
  .follow-up .label-text {
    display: block;
    font-size: 0.875rem;
    font-weight: 500;
    color: #495057;
    margin-bottom: 0.5rem;
  }

  .risk-options {
    display: flex;
    gap: 0.5rem;
  }

  .risk-options button {
    flex: 1;
    padding: 0.625rem 0.5rem;
    font-size: 0.8125rem;
    font-weight: 500;
    background: white;
    border: 1px solid #dee2e6;
    border-radius: 6px;
    color: #495057;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .risk-options button:hover {
    border-color: #ced4da;
    background: #f8f9fa;
  }

  .risk-options button.selected {
    background: #d4edda;
    border-color: #40916c;
    color: #2d6a4f;
    font-weight: 600;
  }

  .goal-details .field {
    margin-bottom: 0.75rem;
  }

  .goal-details .field:last-child {
    margin-bottom: 0;
  }

  .goal-details input {
    width: 100%;
    padding: 0.5rem 0.75rem;
    font-size: 0.9375rem;
    border: 1px solid #dee2e6;
    border-radius: 6px;
  }

  .goal-details input:focus {
    outline: none;
    border-color: #40916c;
  }

  .field-row {
    display: flex;
    gap: 0.75rem;
  }

  .field-row .field {
    flex: 1;
  }

  .input-with-prefix,
  .input-with-suffix {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .input-with-prefix span,
  .input-with-suffix span {
    font-size: 0.875rem;
    color: #6c757d;
    flex-shrink: 0;
  }

  .input-with-prefix input,
  .input-with-suffix input {
    flex: 1;
    min-width: 0;
  }

  /* Hide number input arrows */
  input::-webkit-outer-spin-button,
  input::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
  input[type=number] {
    -moz-appearance: textfield;
  }

  .calculation {
    margin-top: 0.75rem;
    padding-top: 0.75rem;
    border-top: 1px solid #e9ecef;
    font-size: 0.875rem;
    color: #495057;
    text-align: center;
  }

  .calculation strong {
    color: #2d6a4f;
  }

  @media (min-width: 640px) {
    h2 {
      font-size: 1.5rem;
    }

    .goals {
      flex-direction: row;
    }

    .goal-card {
      flex: 1;
      flex-direction: column;
      text-align: center;
    }

    .goal-card .content h3 {
      text-align: center;
    }

    .goal-card .content p {
      text-align: center;
    }
  }
</style>
