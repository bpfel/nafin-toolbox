<script lang="ts">
  interface Props {
    year: number
    month: number
    onchange: (year: number, month: number) => void
  }

  let { year, month, onchange }: Props = $props()

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
  <button class="month-nav" onclick={next}>&rarr;</button>
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
  .month-nav:hover {
    background: #dee2e6;
  }
</style>
