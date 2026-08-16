<script lang="ts">
  // The two totals, side by side. They differ by exactly the set-asides:
  //
  //   unallocated = income − all expenses    "what has no job yet?"
  //   netChange   = income − true outflow    "did my net worth grow?"
  //
  // A set-aside is budgeted as an expense — that is how it keeps its place in
  // the zero-based reading — but it never leaves your net worth. Showing both
  // is the only place that distinction is visible.
  //
  // The figure formerly labelled "Fully allocated" was the opposite of its
  // label: at zero every franc has a job, at 500 there are 500 unassigned. It
  // is called "Unallocated" now, matching the budget summary so the two screens
  // do not name the same quantity differently.

  interface AccountStatus {
    id: string
    name: string
    projected: string
    required: string
    available: string
    // The soonest obligation sinking into this account, if any. An obligation
    // shortfall is money-shaped: how much, and how long is left to find it.
    soonestObligation: { month: string; monthsAway: number } | null
  }

  interface Props {
    plannedIncome: string
    plannedExpenses: string
    trueOutflow: string
    setAside: string
    unallocated: string
    netChange: string
    accounts: AccountStatus[]
  }

  let {
    plannedIncome,
    plannedExpenses,
    trueOutflow,
    setAside,
    unallocated,
    netChange,
    accounts,
  }: Props = $props()

  // Each explanation is useful once and clutter thereafter, so it lives behind
  // a circled (i). One state for both means only one can ever be open.
  let openInfo = $state<string | null>(null)

  function toggleInfo(id: string) {
    openInfo = openInfo === id ? null : id
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && openInfo !== null) {
      event.stopPropagation()
      openInfo = null
    }
  }

  // A click anywhere that is not inside one of the disclosures dismisses it.
  // The toggle itself sits inside `.info-group`, so its own click reaches the
  // handler above and is not undone here.
  function handleDocumentClick(event: MouseEvent) {
    if (openInfo === null) return
    const target = event.target
    if (target instanceof Element && target.closest('.info-group')) return
    openInfo = null
  }

  const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ]

  function monthLabel(month: string): string {
    const [year, index] = month.split('-')
    return `${MONTH_NAMES[Number(index) - 1] ?? month} ${year}`
  }

  function money(amount: string): string {
    return Number(amount).toLocaleString('de-CH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  }

  function moneyAbs(amount: string): string {
    return Math.abs(Number(amount)).toLocaleString('de-CH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  }

  let underFunded = $derived(accounts.filter(a => Number(a.available) < 0))
</script>

<svelte:window onkeydown={handleKeydown} onclick={handleDocumentClick} />

{#snippet infoToggle(id: string, what: string)}
  <button
    type="button"
    class="info-toggle"
    aria-expanded={openInfo === id}
    aria-controls={id}
    aria-label="What does {what} mean?"
    onclick={() => toggleInfo(id)}
  >
    <span aria-hidden="true">i</span>
  </button>
{/snippet}

<div class="allocation-summary">
  <div class="totals">
    <div class="total">
      <span class="total-head info-group">
        <span class="total-label">Unallocated</span>
        {@render infoToggle('info-unallocated', 'Unallocated')}
        {#if openInfo === 'info-unallocated'}
          <span class="info-popover" id="info-unallocated" role="note">
            Income {money(plannedIncome)} − expenses {money(plannedExpenses)}.
            Zero means every franc has a job.
          </span>
        {/if}
      </span>
      <span
        class="total-value"
        class:negative={Number(unallocated) < 0}
        data-testid="total-unallocated"
      >
        {money(unallocated)}
      </span>
    </div>

    <div class="total">
      <span class="total-head info-group">
        <span class="total-label">Net worth change</span>
        {@render infoToggle('info-net-change', 'Net worth change')}
        {#if openInfo === 'info-net-change'}
          <span class="info-popover" id="info-net-change" role="note">
            Income {money(plannedIncome)} − money that actually leaves {money(trueOutflow)}.
            {money(setAside)} is set aside and stays yours.
          </span>
        {/if}
      </span>
      <span
        class="total-value"
        class:negative={Number(netChange) < 0}
        data-testid="total-net-change"
      >
        {money(netChange)}
      </span>
    </div>
  </div>

  {#if accounts.length > 0}
    <table class="accounts">
      <thead>
        <tr>
          <th>Account</th>
          <th class="right">Projected</th>
          <th class="right">Required</th>
          <th class="right">Available</th>
        </tr>
      </thead>
      <tbody>
        {#each accounts as account (account.id)}
          <tr class:short={Number(account.available) < 0}>
            <td>{account.name}</td>
            <td class="right">{money(account.projected)}</td>
            <td class="right">{money(account.required)}</td>
            <td class="right value" class:negative={Number(account.available) < 0}>
              {money(account.available)}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}

  {#each underFunded as account (account.id)}
    <p class="warning">
      <strong>{account.name}</strong> is {moneyAbs(account.available)} short of what
      is planned against it{#if account.soonestObligation}, and the next obligation falls due
        {monthLabel(account.soonestObligation.month)}
        ({account.soonestObligation.monthsAway === 0
          ? 'this month'
          : `${account.soonestObligation.monthsAway} ${account.soonestObligation.monthsAway === 1 ? 'month' : 'months'} to go`}){/if}.
      <span class="advice">Nothing is blocked — adjust a planned amount or correct the balance.</span>
    </p>
  {/each}
</div>

<style>
  .allocation-summary {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1rem 1.25rem;
    background: white;
    border-radius: 8px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }
  .totals {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1.5rem;
  }
  .total {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  /* The popover is positioned against this row, so the figure below never
     shifts when an explanation opens. */
  .total-head {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    align-self: flex-start;
  }
  .total-label {
    font-size: 0.7rem;
    font-weight: 600;
    color: #999;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
  .info-toggle {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1rem;
    height: 1rem;
    padding: 0;
    font-size: 0.65rem;
    font-weight: 700;
    font-family: Georgia, 'Times New Roman', serif;
    line-height: 1;
    color: #888;
    background: white;
    border: 1px solid #ccc;
    border-radius: 999px;
    cursor: pointer;
  }
  .info-toggle:hover {
    color: #2d6a4f;
    border-color: #2d6a4f;
  }
  .info-toggle[aria-expanded='true'] {
    color: white;
    background: #2d6a4f;
    border-color: #2d6a4f;
  }
  .info-toggle:focus-visible {
    outline: 2px solid #2d6a4f;
    outline-offset: 2px;
  }
  .info-popover {
    position: absolute;
    top: calc(100% + 0.4rem);
    left: 0;
    z-index: 20;
    width: max-content;
    max-width: min(20rem, 70vw);
    padding: 0.5rem 0.65rem;
    font-size: 0.8rem;
    color: #555;
    background: white;
    border: 1px solid #dee2e6;
    border-radius: 6px;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.12);
  }
  .total-value {
    font-size: 1.4rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: #2d6a4f;
  }
  .total-value.negative {
    color: #c0392b;
  }
  .accounts {
    width: 100%;
    border-collapse: collapse;
  }
  th {
    text-align: left;
    padding: 0.4rem 0.5rem;
    font-size: 0.7rem;
    color: #999;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    border-bottom: 1px solid #dee2e6;
  }
  td {
    padding: 0.4rem 0.5rem;
    font-size: 0.9rem;
    border-bottom: 1px solid #f1f3f5;
  }
  .right {
    text-align: right;
  }
  td.value {
    font-variant-numeric: tabular-nums;
    font-weight: 600;
  }
  td.negative {
    color: #c0392b;
  }
  tr.short td {
    background: #fdf3f2;
  }
  .warning {
    margin: 0;
    padding: 0.5rem 0.75rem;
    font-size: 0.85rem;
    color: #8a4b3b;
    background: #fdecea;
    border-radius: 6px;
  }
  .advice {
    display: block;
    color: #a0705f;
    font-size: 0.8rem;
  }

  @media (max-width: 640px) {
    .totals {
      grid-template-columns: 1fr;
      gap: 1rem;
    }
    .info-toggle {
      width: 1.25rem;
      height: 1.25rem;
      font-size: 0.75rem;
    }
  }
</style>
