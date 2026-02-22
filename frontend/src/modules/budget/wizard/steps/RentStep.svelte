<script lang="ts">
  import { formatCHF } from '../wizardCalculations'

  interface Props {
    value?: number
    income: number
    onchange: (rent: number) => void
  }

  let { value, income, onchange }: Props = $props()

  function handleInput(e: Event) {
    const target = e.target as HTMLInputElement
    const num = parseFloat(target.value)
    if (!isNaN(num)) {
      onchange(num)
    }
  }

  let rentPercentage = $derived(
    value && income > 0 ? Math.round((value / income) * 100) : null
  )

  let rentWarning = $derived(
    rentPercentage !== null && rentPercentage > 33
      ? 'This is above the recommended 33% of income'
      : null
  )

  // Focus input on mount
  let inputEl: HTMLInputElement

  $effect(() => {
    if (inputEl) {
      inputEl.focus()
    }
  })
</script>

<div class="step">
  <h2>What's your monthly rent?</h2>
  <p>Include any fixed housing costs like Nebenkosten if separate</p>

  <div class="input-wrapper">
    <span class="currency">CHF</span>
    <input
      bind:this={inputEl}
      type="number"
      placeholder="1500"
      value={value ?? ''}
      oninput={handleInput}
      min="0"
      step="50"
    />
    <span class="period">/month</span>
  </div>

  {#if rentPercentage !== null}
    <div class="percentage" class:warning={rentPercentage > 33}>
      <div class="value">{rentPercentage}% of income</div>
      {#if rentWarning}
        <div class="warning-text">{rentWarning}</div>
      {/if}
    </div>
  {/if}

  <div class="presets">
    <button
      class:active={value !== undefined && value >= 900 && value < 1350}
      onclick={() => onchange(1200)}
    >
      <span class="preset-label">Studio</span>
      <span class="preset-amount">CHF 1,200</span>
    </button>
    <button
      class:active={value !== undefined && value >= 1350 && value < 1650}
      onclick={() => onchange(1500)}
    >
      <span class="preset-label">1-2 Room</span>
      <span class="preset-amount">CHF 1,500</span>
    </button>
    <button
      class:active={value !== undefined && value >= 1650 && value < 2000}
      onclick={() => onchange(1800)}
    >
      <span class="preset-label">2-3 Room</span>
      <span class="preset-amount">CHF 1,800</span>
    </button>
    <button
      class:active={value !== undefined && value >= 2000}
      onclick={() => onchange(2200)}
    >
      <span class="preset-label">3+ Room</span>
      <span class="preset-amount">CHF 2,200</span>
    </button>
  </div>
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
    margin-bottom: 2rem;
    text-align: center;
    font-size: 0.9375rem;
  }

  .input-wrapper {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }

  .currency {
    font-size: 1.25rem;
    font-weight: 500;
    color: #495057;
  }

  input {
    width: 140px;
    font-size: 2rem;
    font-weight: 600;
    text-align: center;
    padding: 0.5rem;
    border: 2px solid #dee2e6;
    border-radius: 8px;
    transition: border-color 0.15s ease;
  }

  input:focus {
    outline: none;
    border-color: #40916c;
  }

  input::placeholder {
    color: #ced4da;
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

  .period {
    font-size: 1rem;
    color: #6c757d;
  }

  .percentage {
    text-align: center;
    margin-bottom: 1.5rem;
  }

  .percentage .value {
    font-size: 0.9375rem;
    color: #2d6a4f;
    font-weight: 500;
  }

  .percentage.warning .value {
    color: #f59f00;
  }

  .percentage .warning-text {
    font-size: 0.8125rem;
    color: #f59f00;
    margin-top: 0.25rem;
  }

  .presets {
    display: flex;
    justify-content: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .presets button {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 0.625rem 0.75rem;
    min-width: 75px;
    background: #f8f9fa;
    border: 2px solid #e9ecef;
    border-radius: 10px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .presets button:hover {
    background: #f1f3f5;
    border-color: #ced4da;
  }

  .presets button.active {
    background: #d4edda;
    border-color: #2d6a4f;
  }

  .preset-label {
    font-size: 0.75rem;
    font-weight: 600;
    color: #495057;
    margin-bottom: 0.125rem;
  }

  .presets button.active .preset-label {
    color: #2d6a4f;
  }

  .preset-amount {
    font-size: 0.625rem;
    color: #868e96;
  }

  .presets button.active .preset-amount {
    color: #40916c;
  }

  @media (min-width: 640px) {
    h2 {
      font-size: 1.5rem;
    }

    input {
      width: 180px;
      font-size: 2.5rem;
    }
  }
</style>
