<script lang="ts">
  // The two totals, side by side. They differ by exactly the set-asides:
  //
  //   plannedBalance = income − all expenses    "am I fully allocated?"
  //   netChange      = income − true outflow    "did my net worth grow?"
  //
  // A set-aside is budgeted as an expense — that is how it keeps its place in
  // the zero-based reading — but it never leaves your net worth. Showing both
  // is the only place that distinction is visible.

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
    plannedBalance: string
    netChange: string
    accounts: AccountStatus[]
  }

  let {
    plannedIncome,
    plannedExpenses,
    trueOutflow,
    setAside,
    plannedBalance,
    netChange,
    accounts,
  }: Props = $props()

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

<div class="allocation-summary">
  <div class="totals">
    <div class="total">
      <span class="total-label">Fully allocated</span>
      <span
        class="total-value"
        class:negative={Number(plannedBalance) < 0}
        data-testid="total-allocated"
      >
        CHF {money(plannedBalance)}
      </span>
      <span class="total-caption">
        Income CHF {money(plannedIncome)} − expenses CHF {money(plannedExpenses)}.
        Zero means every franc has a job.
      </span>
    </div>

    <div class="total">
      <span class="total-label">Net worth change</span>
      <span
        class="total-value"
        class:negative={Number(netChange) < 0}
        data-testid="total-net-change"
      >
        CHF {money(netChange)}
      </span>
      <span class="total-caption">
        Income CHF {money(plannedIncome)} − money that actually leaves CHF {money(trueOutflow)}.
        CHF {money(setAside)} is set aside and stays yours.
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
      <strong>{account.name}</strong> is CHF {moneyAbs(account.available)} short of what
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
  .total-label {
    font-size: 0.7rem;
    font-weight: 600;
    color: #999;
    text-transform: uppercase;
    letter-spacing: 0.08em;
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
  .total-caption {
    font-size: 0.8rem;
    color: #888;
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
  }
</style>
