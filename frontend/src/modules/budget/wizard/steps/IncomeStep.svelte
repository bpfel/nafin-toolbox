<script lang="ts">
  interface Props {
    value?: number
    onchange: (income: number) => void
  }

  let { value, onchange }: Props = $props()

  function handleInput(e: Event) {
    const target = e.target as HTMLInputElement
    const num = parseFloat(target.value)
    if (!isNaN(num)) {
      onchange(num)
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
  <h2>What's your monthly income?</h2>
  <p>Enter your net salary after all payroll deductions (AHV, BVG, etc.)</p>

  <div class="input-wrapper">
    <span class="currency">CHF</span>
    <input
      bind:this={inputEl}
      type="number"
      placeholder="6000"
      value={value ?? ''}
      oninput={handleInput}
      min="1000"
      step="100"
    />
    <span class="period">/month</span>
  </div>

  <div class="hint">
    Typical Swiss salaries range from CHF 4,500 to CHF 12,000 per month
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
    width: 160px;
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

  .hint {
    text-align: center;
    font-size: 0.8125rem;
    color: #adb5bd;
  }

  @media (min-width: 640px) {
    h2 {
      font-size: 1.5rem;
    }

    input {
      width: 200px;
      font-size: 2.5rem;
    }
  }
</style>
