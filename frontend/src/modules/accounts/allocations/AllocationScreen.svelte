<script lang="ts">
  import { getVaultState, markDirty } from '../../../lib/crypto/vaultStore.svelte'
  import * as engine from '../../../lib/budget/budgetEngine'
  import type { ReserveDefinition, VaultData } from '../../../lib/crypto/vault'
  import { isLegalCategoryRouting, isLegalRouting } from '../../../lib/accounts/routing'
  import {
    availableForAccount,
    projectedBalance,
    requiredForAccount,
  } from '../../../lib/accounts/accountMath'
  import { fromCents, monthsBetween, nextDue, toCents } from '../../../lib/accounts/reserveMath'
  import AllocationRow from './AllocationRow.svelte'
  import AllocationSummary from './AllocationSummary.svelte'
  import PurchaseDialog from './PurchaseDialog.svelte'

  // The monthly flow view: which budget entries move money from where to where,
  // and what accumulates this month.
  //
  // Reads the budget's categories and planned amounts but never writes them —
  // amounts stay the budget's business. What this screen owns is routing and
  // reserve definitions, which the budget never shows.

  interface Routing {
    sourceAccountId: string | null
    sinkAccountId: string | null
  }

  interface Props {
    // Optional: when the module root drives the month, pass both. Left out, the
    // screen navigates on its own.
    year?: number
    month?: number
    onmonthchange?: (year: number, month: number) => void
  }

  let { year: yearProp, month: monthProp, onmonthchange }: Props = $props()

  const vaultState = getVaultState()

  const now = new Date()
  const nowYear = now.getFullYear()
  const nowMonth = now.getMonth() + 1

  // Projections are meaningful ahead of time, but not indefinitely — a year of
  // lookahead covers every reserve question worth asking now.
  const MAX_LOOKAHEAD_MONTHS = 12

  // Reactivity trigger: the engines mutate the vault object in place, which
  // runes cannot observe. Every derived below reads `version` so it recomputes.
  let version = $state(0)

  let internalYear = $state(nowYear)
  let internalMonth = $state(nowMonth)

  let controlled = $derived(yearProp !== undefined && monthProp !== undefined)
  let year = $derived(yearProp ?? internalYear)
  let month = $derived(monthProp ?? internalMonth)

  let currentMonth = $derived(`${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`)

  const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ]

  let monthLabel = $derived(`${MONTH_NAMES[month - 1]} ${year}`)

  let atMaxMonth = $derived(
    (year - nowYear) * 12 + (month - nowMonth) >= MAX_LOOKAHEAD_MONTHS,
  )

  function changeMonth(offset: number) {
    const index = year * 12 + (month - 1) + offset
    const nextYear = Math.floor(index / 12)
    const nextMonth = index - nextYear * 12 + 1
    if (!controlled) {
      internalYear = nextYear
      internalMonth = nextMonth
    }
    onmonthchange?.(nextYear, nextMonth)
  }

  let error = $state<string | null>(null)
  let purchaseCategoryId = $state<string | null>(null)

  function money(amount: string): string {
    return Number(amount).toLocaleString('de-CH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  }

  function cents(amount: string): number {
    try {
      return toCents(amount)
    } catch {
      return 0
    }
  }

  let categories = $derived(
    vaultState.vault && version >= 0 ? engine.listCategories(vaultState.vault) : [],
  )
  let accounts = $derived(vaultState.vault && version >= 0 ? vaultState.vault.accounts : [])

  // Planned amounts are read straight from the period so a month the budget has
  // never opened simply shows zeroes instead of being created here.
  let plannedById = $derived.by(() => {
    void version
    const map = new Map<string, string>()
    const vault = vaultState.vault
    if (!vault) return map
    const period = engine.getPeriod(vault, year, month)
    for (const entry of period?.entries ?? []) {
      map.set(entry.categoryId, entry.plannedAmount)
    }
    return map
  })

  function plannedFor(categoryId: string): string {
    return plannedById.get(categoryId) ?? '0.00'
  }

  // Rows get a *snapshot* of the category, not the vault's own object. Routing
  // is changed by mutating that object in place, which runes cannot observe: a
  // row handed the same object reference would never re-render. Rebuilding the
  // snapshots whenever `version` moves is what makes a routing change visible.
  let rows = $derived.by(() => {
    void version
    return categories.map(category => ({
      category: { ...category },
      plannedAmount: plannedFor(category.id),
      sinkAvailable: sinkAvailable(category.sinkAccountId),
    }))
  })

  let incomeRows = $derived(rows.filter(r => r.category.type === 'income'))
  let expenseRows = $derived(rows.filter(r => r.category.type === 'expense'))

  // The two totals. They differ by exactly the set-asides: budgeted as
  // expenses, but they never leave your net worth.
  let totals = $derived.by(() => {
    let income = 0
    let expenses = 0
    let outflow = 0
    let setAside = 0

    for (const category of categories) {
      const planned = cents(plannedFor(category.id))
      if (category.type === 'income') {
        income += planned
        continue
      }
      expenses += planned
      if (category.sinkAccountId === null) outflow += planned
      else setAside += planned
    }

    return {
      income: fromCents(income),
      expenses: fromCents(expenses),
      outflow: fromCents(outflow),
      setAside: fromCents(setAside),
      plannedBalance: fromCents(income - expenses),
      netChange: fromCents(income - outflow),
    }
  })

  // The soonest obligation sinking into an account gives its shortfall a
  // deadline. Amortizations are deliberately excluded — their date moves.
  function soonestObligation(vault: VaultData, accountId: string) {
    let best: { month: string; monthsAway: number } | null = null
    for (const category of vault.budget.categories) {
      if (category.archived) continue
      if (category.reserve?.kind !== 'obligation') continue
      if (category.sinkAccountId !== accountId) continue
      try {
        const due = nextDue(category.reserve.anchorMonth, category.reserve.periodMonths, currentMonth)
        const monthsAway = monthsBetween(currentMonth, due)
        if (!best || monthsAway < best.monthsAway) best = { month: due, monthsAway }
      } catch {
        // A malformed definition has no due date to report.
      }
    }
    return best
  }

  let accountStatuses = $derived.by(() => {
    void version
    const vault = vaultState.vault
    if (!vault) return []
    return vault.accounts.map(account => {
      try {
        return {
          id: account.id,
          name: account.name,
          projected: projectedBalance(vault, account.id, currentMonth),
          required: requiredForAccount(vault, account.id, currentMonth),
          available: availableForAccount(vault, account.id, currentMonth),
          soonestObligation: soonestObligation(vault, account.id),
        }
      } catch {
        // One unreadable reserve definition should cost that account its
        // figures, not take the whole screen down with it.
        return {
          id: account.id,
          name: account.name,
          projected: account.currentAmount,
          required: '0.00',
          available: '0.00',
          soonestObligation: null,
        }
      }
    })
  })

  let availableByAccount = $derived(
    new Map(accountStatuses.map(status => [status.id, status.available])),
  )

  function sinkAvailable(sinkAccountId: string | null): string | null {
    if (sinkAccountId === null) return null
    return availableByAccount.get(sinkAccountId) ?? null
  }

  function findCategory(categoryId: string) {
    return vaultState.vault?.budget.categories.find(c => c.id === categoryId) ?? null
  }

  function applyRouting(categoryId: string, routing: Routing) {
    const category = findCategory(categoryId)
    if (!category) return

    // The controls cannot produce an illegal pair; this is the assertion that
    // keeps that true if they ever change.
    if (!isLegalRouting(category.type, routing.sourceAccountId, routing.sinkAccountId)) {
      error = `${category.name} cannot be routed that way.`
      return
    }

    error = null
    category.sourceAccountId = routing.sourceAccountId
    category.sinkAccountId = routing.sinkAccountId
    // A reserve has to accumulate somewhere. Routing back to spending removes
    // the sink, so the reserve goes with it rather than lingering illegally.
    if (category.sinkAccountId === null) delete category.reserve

    markDirty()
    version++
  }

  function applyReserve(categoryId: string, reserve: ReserveDefinition | undefined) {
    const category = findCategory(categoryId)
    if (!category) return

    const previous = category.reserve
    if (reserve === undefined) delete category.reserve
    else category.reserve = reserve

    // `reserve` implies expense with a non-null sink. The set-aside gate makes
    // that structural; this catches any other route in.
    if (!isLegalCategoryRouting(category)) {
      if (previous === undefined) delete category.reserve
      else category.reserve = previous
      error = `${category.name} must be set aside into an account before it can have a target.`
      return
    }

    error = null
    markDirty()
    version++
  }

  // The whole of the purchase: the real price becomes the next cycle's target,
  // and the anchor moves to the month of purchase so the cycle restarts. No
  // money moves, nothing else is touched.
  function applyPurchase(categoryId: string, pricePaid: string, purchaseMonth: string) {
    const category = findCategory(categoryId)
    if (!category?.reserve) return

    category.reserve = {
      ...category.reserve,
      targetAmount: pricePaid,
      anchorMonth: purchaseMonth,
    }

    markDirty()
    version++
    purchaseCategoryId = null
  }

  let purchaseContext = $derived.by(() => {
    void version
    if (purchaseCategoryId === null) return null
    const category = findCategory(purchaseCategoryId)
    if (!category?.reserve || category.reserve.kind !== 'amortization') return null
    const sink = category.sinkAccountId
    return {
      categoryId: category.id,
      categoryName: category.name,
      reserve: category.reserve,
      accountName: accounts.find(a => a.id === sink)?.name ?? 'the account',
      available: sinkAvailable(sink) ?? '0.00',
    }
  })
</script>

<div class="allocation-screen">
  <div class="header">
    <div class="month-nav">
      <button onclick={() => changeMonth(-1)} aria-label="Previous month">&larr;</button>
      <span class="month-label">{monthLabel}</span>
      <button onclick={() => changeMonth(1)} disabled={atMaxMonth} aria-label="Next month">
        &rarr;
      </button>
    </div>
  </div>

  {#if !vaultState.vault}
    <p class="empty">Loading…</p>
  {:else if categories.length === 0}
    <p class="empty">
      No budget categories yet. Add them in the Budget module and they will appear here, ready to
      route.
    </p>
  {:else}
    <AllocationSummary
      plannedIncome={totals.income}
      plannedExpenses={totals.expenses}
      trueOutflow={totals.outflow}
      setAside={totals.setAside}
      plannedBalance={totals.plannedBalance}
      netChange={totals.netChange}
      accounts={accountStatuses}
    />

    {#if error}
      <p class="error">{error}</p>
    {/if}

    {#if incomeRows.length > 0}
      <section class="flow-section">
        <h3>Money in</h3>
        <div class="rows">
          {#each incomeRows as row (row.category.id)}
            <AllocationRow
              category={row.category}
              plannedAmount={row.plannedAmount}
              {accounts}
              {currentMonth}
              sinkAvailable={row.sinkAvailable}
              onroutingchange={(routing) => applyRouting(row.category.id, routing)}
              onreservechange={(reserve) => applyReserve(row.category.id, reserve)}
              onpurchase={() => (purchaseCategoryId = row.category.id)}
            />
          {/each}
        </div>
      </section>
    {/if}

    {#if expenseRows.length > 0}
      <section class="flow-section">
        <h3>Money out and money set aside</h3>
        <div class="rows">
          {#each expenseRows as row (row.category.id)}
            <AllocationRow
              category={row.category}
              plannedAmount={row.plannedAmount}
              {accounts}
              {currentMonth}
              sinkAvailable={row.sinkAvailable}
              onroutingchange={(routing) => applyRouting(row.category.id, routing)}
              onreservechange={(reserve) => applyReserve(row.category.id, reserve)}
              onpurchase={() => (purchaseCategoryId = row.category.id)}
            />
          {/each}
        </div>
        <p class="section-note">
          Set-asides total CHF {money(totals.setAside)} this month. They count as budgeted expenses
          but stay in your accounts.
        </p>
      </section>
    {/if}
  {/if}
</div>

{#if purchaseContext}
  <PurchaseDialog
    categoryName={purchaseContext.categoryName}
    reserve={purchaseContext.reserve}
    accountName={purchaseContext.accountName}
    available={purchaseContext.available}
    {currentMonth}
    onconfirm={(price, purchaseMonth) =>
      applyPurchase(purchaseContext!.categoryId, price, purchaseMonth)}
    onclose={() => (purchaseCategoryId = null)}
  />
{/if}

<style>
  .allocation-screen {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }
  .header {
    display: flex;
    justify-content: flex-start;
  }
  .month-nav {
    display: flex;
    align-items: center;
    gap: 1rem;
  }
  .month-nav button {
    padding: 0.25rem 0.75rem;
    font-size: 1rem;
    background: #e9ecef;
    color: #1a1a2e;
    border: none;
    border-radius: 6px;
    cursor: pointer;
  }
  .month-nav button:hover:not(:disabled) {
    background: #dee2e6;
  }
  .month-nav button:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }
  .month-label {
    font-size: 1.1rem;
    font-weight: 600;
    min-width: 160px;
    text-align: center;
  }
  .flow-section {
    background: white;
    border-radius: 8px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    overflow: hidden;
  }
  h3 {
    margin: 0;
    padding: 0.75rem 1rem;
    font-size: 0.85rem;
    font-weight: 600;
    color: #666;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    background: #f8f9fa;
    border-bottom: 1px solid #dee2e6;
  }
  .rows {
    display: flex;
    flex-direction: column;
  }
  .section-note {
    margin: 0;
    padding: 0.6rem 1rem;
    font-size: 0.8rem;
    color: #888;
    border-top: 1px solid #f1f3f5;
  }
  .empty {
    padding: 2rem;
    text-align: center;
    color: #888;
    background: white;
    border-radius: 8px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }
  .error {
    margin: 0;
    padding: 0.6rem 0.9rem;
    font-size: 0.85rem;
    color: #c0392b;
    background: #fdecea;
    border-radius: 6px;
  }

  @media (max-width: 640px) {
    .month-nav button {
      min-width: 44px;
      min-height: 44px;
    }
  }
</style>
