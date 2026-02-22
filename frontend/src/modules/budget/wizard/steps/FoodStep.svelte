<script lang="ts">
  import { formatCHF, DEFAULTS } from '../wizardCalculations'

  interface Props {
    value: number
    onchange: (food: number) => void
  }

  let { value, onchange }: Props = $props()

  const MIN = 300
  const MAX = 1200
  const STEP = 50

  function handleSlider(e: Event) {
    const target = e.target as HTMLInputElement
    onchange(parseInt(target.value, 10))
  }

  let percentage = $derived(((value - MIN) / (MAX - MIN)) * 100)

  let description = $derived.by(() => {
    if (value < 450) return 'Very frugal - cooking at home, discount stores'
    if (value < 600) return 'Budget-conscious - mostly home cooking'
    if (value < 750) return 'Average Swiss spending on groceries'
    if (value < 900) return 'Comfortable - quality ingredients, some convenience'
    return 'Premium - organic, specialty foods'
  })
</script>

<div class="step">
  <h2>Monthly food budget?</h2>
  <p>Groceries and household essentials (not dining out)</p>

  <div class="slider-value">
    <span class="amount">{formatCHF(value)}</span>
    <span class="period">/month</span>
  </div>

  <div class="slider-wrapper">
    <input
      type="range"
      min={MIN}
      max={MAX}
      step={STEP}
      {value}
      oninput={handleSlider}
      style="--percentage: {percentage}%"
    />
    <div class="labels">
      <span>{formatCHF(MIN)}</span>
      <span>{formatCHF(MAX)}</span>
    </div>
  </div>

  <div class="description">{description}</div>

  <div class="presets">
    <button
      class:active={value >= 300 && value < 550}
      onclick={() => onchange(450)}
    >
      <span class="preset-label">Budget</span>
      <span class="preset-amount">CHF 450</span>
    </button>
    <button
      class:active={value >= 550 && value < 800}
      onclick={() => onchange(DEFAULTS.food)}
    >
      <span class="preset-label">Average</span>
      <span class="preset-amount">CHF 650</span>
    </button>
    <button
      class:active={value >= 800}
      onclick={() => onchange(900)}
    >
      <span class="preset-label">Comfortable</span>
      <span class="preset-amount">CHF 900</span>
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

  .slider-value {
    text-align: center;
    margin-bottom: 1.5rem;
  }

  .slider-value .amount {
    font-size: 2.5rem;
    font-weight: 600;
    color: #2d6a4f;
  }

  .slider-value .period {
    font-size: 1rem;
    color: #6c757d;
  }

  .slider-wrapper {
    padding: 0 0.5rem;
    margin-bottom: 1rem;
  }

  input[type="range"] {
    width: 100%;
    height: 8px;
    -webkit-appearance: none;
    appearance: none;
    background: linear-gradient(
      to right,
      #2d6a4f 0%,
      #2d6a4f var(--percentage),
      #e9ecef var(--percentage),
      #e9ecef 100%
    );
    border-radius: 4px;
    cursor: pointer;
  }

  input[type="range"]::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 24px;
    height: 24px;
    background: white;
    border: 2px solid #2d6a4f;
    border-radius: 50%;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    cursor: grab;
  }

  input[type="range"]::-webkit-slider-thumb:active {
    cursor: grabbing;
  }

  input[type="range"]::-moz-range-thumb {
    width: 24px;
    height: 24px;
    background: white;
    border: 2px solid #2d6a4f;
    border-radius: 50%;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    cursor: grab;
  }

  .labels {
    display: flex;
    justify-content: space-between;
    margin-top: 0.5rem;
    font-size: 0.75rem;
    color: #adb5bd;
  }

  .description {
    text-align: center;
    font-size: 0.875rem;
    color: #6c757d;
    margin-bottom: 1.5rem;
    min-height: 1.25rem;
  }

  .presets {
    display: flex;
    justify-content: center;
    gap: 0.75rem;
  }

  .presets button {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 0.75rem 1rem;
    min-width: 90px;
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
    font-size: 0.8125rem;
    font-weight: 600;
    color: #495057;
    margin-bottom: 0.125rem;
  }

  .presets button.active .preset-label {
    color: #2d6a4f;
  }

  .preset-amount {
    font-size: 0.6875rem;
    color: #868e96;
  }

  .presets button.active .preset-amount {
    color: #40916c;
  }

  @media (min-width: 640px) {
    h2 {
      font-size: 1.5rem;
    }
  }
</style>
