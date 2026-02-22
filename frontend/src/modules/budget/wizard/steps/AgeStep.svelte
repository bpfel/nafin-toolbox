<script lang="ts">
  import { calculateHealthInsurance, formatCHF } from '../wizardCalculations'

  interface Props {
    value?: number
    healthInsurance?: number
    onchange: (age: number) => void
    oninsurancechange: (amount: number) => void
  }

  let { value, healthInsurance, onchange, oninsurancechange }: Props = $props()

  function handleInput(e: Event) {
    const target = e.target as HTMLInputElement
    const num = parseInt(target.value, 10)
    if (!isNaN(num)) {
      onchange(num)
    }
  }

  function handleInsuranceInput(e: Event) {
    const target = e.target as HTMLInputElement
    const num = parseFloat(target.value)
    if (!isNaN(num) && num >= 0) {
      oninsurancechange(num)
    }
  }

  // Calculate default insurance based on age
  let defaultInsurance = $derived(
    value ? calculateHealthInsurance(value) : null
  )

  // Use custom value if set, otherwise use calculated default
  let displayInsurance = $derived(
    healthInsurance ?? defaultInsurance
  )

  let isCustom = $derived(
    healthInsurance !== undefined && healthInsurance !== defaultInsurance
  )

  function resetToDefault() {
    if (defaultInsurance) {
      oninsurancechange(defaultInsurance)
    }
  }

  // Focus input on mount
  let inputEl: HTMLInputElement

  $effect(() => {
    if (inputEl) {
      inputEl.focus()
    }
  })
</script>

<div class="step">
  <h2>How old are you?</h2>
  <p>This helps us estimate your health insurance costs</p>

  <div class="input-wrapper">
    <input
      bind:this={inputEl}
      type="number"
      placeholder="30"
      value={value ?? ''}
      oninput={handleInput}
      min="16"
      max="100"
    />
    <span class="unit">years</span>
  </div>

  {#if displayInsurance}
    <div class="insurance-preview">
      <div class="header">
        <span class="label">Health insurance</span>
        {#if isCustom}
          <button class="reset-btn" onclick={resetToDefault}>Reset to estimate</button>
        {/if}
      </div>
      <div class="insurance-input">
        <span class="currency">CHF</span>
        <input
          type="number"
          value={displayInsurance}
          oninput={handleInsuranceInput}
          min="0"
          step="10"
        />
        <span class="period">/month</span>
      </div>
      <div class="note">
        {#if isCustom}
          Custom amount
        {:else}
          Based on average Swiss premiums for your age group
        {/if}
      </div>
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
    margin-bottom: 2rem;
    text-align: center;
    font-size: 0.9375rem;
  }

  .input-wrapper {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    margin-bottom: 2rem;
  }

  .input-wrapper input {
    width: 100px;
    font-size: 2.5rem;
    font-weight: 600;
    text-align: center;
    padding: 0.5rem;
    border: 2px solid #dee2e6;
    border-radius: 8px;
    transition: border-color 0.15s ease;
  }

  .input-wrapper input:focus {
    outline: none;
    border-color: #40916c;
  }

  .input-wrapper input::placeholder {
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

  .unit {
    font-size: 1.25rem;
    color: #6c757d;
  }

  .insurance-preview {
    background: #f8fdf9;
    border: 1px solid #d4edda;
    border-radius: 8px;
    padding: 1rem;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.5rem;
  }

  .header .label {
    font-size: 0.875rem;
    color: #6c757d;
  }

  .reset-btn {
    font-size: 0.75rem;
    color: #40916c;
    background: none;
    border: none;
    padding: 0.25rem 0.5rem;
    cursor: pointer;
    text-decoration: underline;
  }

  .reset-btn:hover {
    color: #2d6a4f;
  }

  .insurance-input {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
  }

  .insurance-input .currency {
    font-size: 1rem;
    font-weight: 500;
    color: #495057;
  }

  .insurance-input input {
    width: 100px;
    font-size: 1.5rem;
    font-weight: 600;
    text-align: center;
    padding: 0.375rem 0.5rem;
    border: 1px solid #d4edda;
    border-radius: 6px;
    background: white;
    color: #2d6a4f;
    transition: border-color 0.15s ease;
  }

  .insurance-input input:focus {
    outline: none;
    border-color: #40916c;
  }

  .insurance-input .period {
    font-size: 0.875rem;
    color: #6c757d;
  }

  .note {
    font-size: 0.75rem;
    color: #adb5bd;
    margin-top: 0.5rem;
    text-align: center;
  }

  @media (min-width: 640px) {
    h2 {
      font-size: 1.5rem;
    }
  }
</style>
