<script lang="ts">
  interface Props {
    year: number
    month: number
    maxYear: number
    maxMonth: number
    onchange: (year: number, month: number) => void
  }

  let { year, month, maxYear, maxMonth, onchange }: Props = $props()

  let atMax = $derived(year > maxYear || (year === maxYear && month >= maxMonth))

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ]

  function prev() {
    if (month === 1) {
      onchange(year - 1, 12)
    } else {
      onchange(year, month - 1)
    }
  }

  function next() {
    if (atMax) return
    if (month === 12) {
      onchange(year + 1, 1)
    } else {
      onchange(year, month + 1)
    }
  }
</script>

<div class="month-selector">
  <button class="month-nav" onclick={prev}>&larr;</button>
  <span class="month-label">{monthNames[month - 1]} {year}</span>
  <button class="month-nav" onclick={next} disabled={atMax}>&rarr;</button>
</div>

<style>
  .month-selector {
    display: flex;
    align-items: center;
    gap: 1rem;
  }
  .month-label {
    font-size: 1.1rem;
    font-weight: 600;
    min-width: 160px;
    text-align: center;
  }
  .month-nav {
    padding: 0.25rem 0.75rem;
    font-size: 1rem;
    background: #e9ecef;
    color: #1a1a2e;
  }
  .month-nav:hover:not(:disabled) {
    background: #dee2e6;
  }
  .month-nav:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  @media (max-width: 768px) {
    .month-nav {
      min-width: 44px;
      min-height: 44px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
  }
</style>
