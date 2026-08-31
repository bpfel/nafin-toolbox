<script lang="ts">
  import { t } from '../../../lib/i18n/index.svelte'
  import { getVaultState, markDirty } from '../../../lib/crypto/vaultStore.svelte'
  import * as engine from '../../../lib/budget/budgetEngine'
  import type {
    ReserveDefinition,
    VaultEntry,
    VaultCategory,
    VaultData,
  } from '../../../lib/crypto/vault'
  import { isLegalEntryRouting, isLegalRouting } from '../../../lib/accounts/routing'
  import {
    availableForAccount,
    projectedBalance,
    requiredForAccount,
  } from '../../../lib/accounts/accountMath'
  import { fromCents, monthsBetween, nextDue, toCents } from '../../../lib/accounts/reserveMath'
  import AllocationRow from './AllocationRow.svelte'
  import AllocationSummary from './AllocationSummary.svelte'
  import PurchaseDialog from './PurchaseDialog.svelte'

  // The monthly flow view: which budget lines move money from where to where,
  // and what accumulates this month.
  //
  // Reads the budget's entries and planned amounts but never writes them —
  // amounts stay the budget's business. What this screen owns is routing and
  // reserve definitions, which the budget never shows.
  //
  // There is one plan, so there is nothing to navigate. The month still matters
  // — reserves cycle in months and obligations fall due in one — but it is
  // simply today's, not a position in a timeline the user moves along.

  interface Routing {
    sourceAccountId: string | null
    sinkAccountId: string | null
  }

  // What a row needs to render. The entry is a snapshot, never the vault's
  // own object — see `rows` below for why that matters.
  interface RowView {
    entry: VaultEntry
    plannedAmount: string
    sinkAvailable: string | null
  }

  interface RowCategory {
    categoryId: string
    categoryName: string
    rows: RowView[]
    plannedTotal: string
  }

  interface Props {
    /** 'YYYY-MM' the reserve and account figures are computed for. Defaults to now. */
    currentMonth?: string
  }

  function thisMonth(): string {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  }

  let { currentMonth = thisMonth() }: Props = $props()

  const vaultState = getVaultState()

  // Reactivity trigger: the engines mutate the vault object in place, which
  // runes cannot observe. Every derived below reads `version` so it recomputes.
  let version = $state(0)

  let error = $state<string | null>(null)
  let purchaseEntryId = $state<string | null>(null)

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

  let entries = $derived(
    vaultState.vault && version >= 0 ? engine.listEntries(vaultState.vault) : [],
  )
  let accounts = $derived(vaultState.vault && version >= 0 ? vaultState.vault.accounts : [])

  // Planned amounts come from the standing plan, read-only. An entry the plan
  // has no line for reads as zero rather than having one created here.
  let plannedById = $derived.by(() => {
    void version
    const map = new Map<string, string>()
    const vault = vaultState.vault
    if (!vault) return map
    for (const entry of engine.getPlanSummary(vault).entries) {
      map.set(entry.entryId, entry.plannedAmount)
    }
    return map
  })

  function plannedFor(entryId: string): string {
    return plannedById.get(entryId) ?? '0.00'
  }

  // Rows get a *snapshot* of the entry, not the vault's own object. Routing
  // is changed by mutating that object in place, which runes cannot observe: a
  // row handed the same object reference would never re-render. Rebuilding the
  // snapshots whenever `version` moves is what makes a routing change visible.
  let rows = $derived.by((): RowView[] => {
    void version
    return entries.map(entry => ({
      entry: { ...entry },
      plannedAmount: plannedFor(entry.id),
      sinkAvailable: sinkAvailable(entry.sinkAccountId),
    }))
  })

  let incomeRows = $derived(rows.filter(r => r.entry.type === 'income'))
  let expenseRows = $derived(rows.filter(r => r.entry.type === 'expense'))

  // --- Grouping ----------------------------------------------------------
  // Same shape as the budget table: rows are grouped by their budget category and
  // ordered by the category's own `sortOrder`, so a user who has arranged their
  // categories in the budget sees that same arrangement here.

  let categoriesById = $derived.by((): Map<string, VaultCategory> => {
    void version
    const vault = vaultState.vault
    if (!vault) return new Map()
    return new Map(engine.listCategories(vault).map(g => [g.id, g]))
  })

  function categoryOrder(categoryId: string): number {
    return categoriesById.get(categoryId)?.sortOrder ?? Number.MAX_SAFE_INTEGER
  }

  // An entry whose category was deleted still has to show up, so an unknown
  // category id collapses into the unnamed "Other" bucket that sorts last.
  function categoryRows(list: RowView[]): RowCategory[] {
    const map = new Map<string, { categoryId: string; categoryName: string; rows: RowView[]; cents: number }>()
    for (const row of list) {
      const category = categoriesById.get(row.entry.categoryId)
      const name = category?.name ?? ''
      let bucket = map.get(name)
      if (!bucket) {
        bucket = { categoryId: category?.id ?? '', categoryName: name, rows: [], cents: 0 }
        map.set(name, bucket)
      }
      bucket.rows.push(row)
      bucket.cents += cents(row.plannedAmount)
    }
    return Array.from(map.values())
      .sort((a, b) => categoryOrder(a.categoryId) - categoryOrder(b.categoryId))
      .map(b => ({
        categoryId: b.categoryId,
        categoryName: b.categoryName,
        rows: b.rows,
        plannedTotal: fromCents(b.cents),
      }))
  }

  let incomeCategories = $derived(categoryRows(incomeRows))
  let expenseCategories = $derived(categoryRows(expenseRows))

  // Collapse is a view preference of this screen alone: not persisted, not
  // shared with the budget table. Keyed by type so "Other" under income and
  // "Other" under expenses fold independently.
  let collapsedCategories = $state(new Set<string>())

  function toggleCategory(type: 'income' | 'expense', categoryName: string) {
    const key = `${type}:${categoryName}`
    const next = new Set(collapsedCategories)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    collapsedCategories = next
  }

  function isCollapsed(type: 'income' | 'expense', categoryName: string): boolean {
    return collapsedCategories.has(`${type}:${categoryName}`)
  }

  // A lone category is not a grouping — a header for it adds a row of chrome that
  // says nothing, named or not. Matches the budget table, which dropped the
  // "or it has a name" half of this condition for the same reason.
  function showsHeaders(categories: RowCategory[]): boolean {
    return categories.length > 1
  }

  // The two totals. They differ by exactly the set-asides: budgeted as
  // expenses, but they never leave your net worth.
  let totals = $derived.by(() => {
    let income = 0
    let expenses = 0
    let outflow = 0
    let setAside = 0

    for (const entry of entries) {
      const planned = cents(plannedFor(entry.id))
      if (entry.type === 'income') {
        income += planned
        continue
      }
      expenses += planned
      if (entry.sinkAccountId === null) outflow += planned
      else setAside += planned
    }

    return {
      income: fromCents(income),
      expenses: fromCents(expenses),
      outflow: fromCents(outflow),
      setAside: fromCents(setAside),
      unallocated: fromCents(income - expenses),
      netChange: fromCents(income - outflow),
    }
  })

  // The soonest obligation sinking into an account gives its shortfall a
  // deadline. Amortizations are deliberately excluded — their date moves.
  function soonestObligation(vault: VaultData, accountId: string) {
    let best: { month: string; monthsAway: number } | null = null
    for (const entry of vault.budget.entries) {
      if (entry.archived) continue
      if (entry.reserve?.kind !== 'obligation') continue
      if (entry.sinkAccountId !== accountId) continue
      try {
        const due = nextDue(entry.reserve.anchorMonth, entry.reserve.periodMonths, currentMonth)
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

  function findEntry(entryId: string) {
    return vaultState.vault?.budget.entries.find(c => c.id === entryId) ?? null
  }

  function applyRouting(entryId: string, routing: Routing) {
    const entry = findEntry(entryId)
    if (!entry) return

    // The controls cannot produce an illegal pair; this is the assertion that
    // keeps that true if they ever change.
    if (!isLegalRouting(entry.type, routing.sourceAccountId, routing.sinkAccountId)) {
      error = `${entry.name} cannot be routed that way.`
      return
    }

    error = null
    entry.sourceAccountId = routing.sourceAccountId
    entry.sinkAccountId = routing.sinkAccountId
    // A reserve has to accumulate somewhere. Routing back to spending removes
    // the sink, so the reserve goes with it rather than lingering illegally.
    if (entry.sinkAccountId === null) delete entry.reserve

    markDirty()
    version++
  }

  function applyReserve(entryId: string, reserve: ReserveDefinition | undefined) {
    const entry = findEntry(entryId)
    if (!entry) return

    const previous = entry.reserve
    if (reserve === undefined) delete entry.reserve
    else entry.reserve = reserve

    // `reserve` implies expense with a non-null sink. The set-aside gate makes
    // that structural; this catches any other route in.
    if (!isLegalEntryRouting(entry)) {
      if (previous === undefined) delete entry.reserve
      else entry.reserve = previous
      error = `${entry.name} must be set aside into an account before it can have a target.`
      return
    }

    error = null
    markDirty()
    version++
  }

  // The whole of the purchase: the real price becomes the next cycle's target,
  // and the anchor moves to the month of purchase so the cycle restarts. No
  // money moves, nothing else is touched.
  function applyPurchase(entryId: string, pricePaid: string, purchaseMonth: string) {
    const entry = findEntry(entryId)
    if (!entry?.reserve) return

    entry.reserve = {
      ...entry.reserve,
      targetAmount: pricePaid,
      anchorMonth: purchaseMonth,
    }

    markDirty()
    version++
    purchaseEntryId = null
  }

  let purchaseContext = $derived.by(() => {
    void version
    if (purchaseEntryId === null) return null
    const entry = findEntry(purchaseEntryId)
    if (!entry?.reserve || entry.reserve.kind !== 'amortization') return null
    const sink = entry.sinkAccountId
    return {
      entryId: entry.id,
      entryName: entry.name,
      reserve: entry.reserve,
      accountName: accounts.find(a => a.id === sink)?.name ?? 'the account',
      available: sinkAvailable(sink) ?? '0.00',
    }
  })
</script>

{#snippet categoryBlock(type: 'income' | 'expense', category: RowCategory, withHeader: boolean)}
  <div class="category">
    {#if withHeader}
      <button
        type="button"
        class="category-header"
        class:collapsed={isCollapsed(type, category.categoryName)}
        data-testid="allocation-category"
        aria-expanded={!isCollapsed(type, category.categoryName)}
        onclick={() => toggleCategory(type, category.categoryName)}
      >
        <span class="category-chevron">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
            <path d="M2 4 L6 10 L10 4 Z" />
          </svg>
        </span>
        <span class="category-name">{category.categoryName || 'Other'}</span>
        <span class="category-subtotal">{money(category.plannedTotal)}</span>
      </button>
    {/if}
    {#if !withHeader || !isCollapsed(type, category.categoryName)}
      <div class="rows">
        {#each category.rows as row (row.entry.id)}
          <AllocationRow
            entry={row.entry}
            plannedAmount={row.plannedAmount}
            {accounts}
            {currentMonth}
            sinkAvailable={row.sinkAvailable}
            onroutingchange={(routing) => applyRouting(row.entry.id, routing)}
            onreservechange={(reserve) => applyReserve(row.entry.id, reserve)}
            onpurchase={() => (purchaseEntryId = row.entry.id)}
          />
        {/each}
      </div>
    {/if}
  </div>
{/snippet}

<div class="allocation-screen">
  {#if !vaultState.vault}
    <p class="empty">{t('state.loading')}</p>
  {:else if entries.length === 0}
    <p class="empty">
      {t('alloc.noEntries')}
    </p>
  {:else}
    <AllocationSummary
      plannedIncome={totals.income}
      plannedExpenses={totals.expenses}
      trueOutflow={totals.outflow}
      setAside={totals.setAside}
      unallocated={totals.unallocated}
      netChange={totals.netChange}
      accounts={accountStatuses}
    />

    {#if error}
      <p class="error">{error}</p>
    {/if}

    {#if incomeCategories.length > 0}
      <section class="flow-section">
        <h3>{t('alloc.moneyIn')}</h3>
        {#each incomeCategories as category (category.categoryName)}
          {@render categoryBlock('income', category, showsHeaders(incomeCategories))}
        {/each}
      </section>
    {/if}

    {#if expenseCategories.length > 0}
      <section class="flow-section">
        <h3>{t('alloc.moneyOut')}</h3>
        {#each expenseCategories as category (category.categoryName)}
          {@render categoryBlock('expense', category, showsHeaders(expenseCategories))}
        {/each}
        <p class="section-note">
          {t('alloc.setAsideTotal', { amount: money(totals.setAside) })}
        </p>
      </section>
    {/if}
  {/if}
</div>

{#if purchaseContext}
  <PurchaseDialog
    entryName={purchaseContext.entryName}
    reserve={purchaseContext.reserve}
    accountName={purchaseContext.accountName}
    available={purchaseContext.available}
    {currentMonth}
    onconfirm={(price, purchaseMonth) =>
      applyPurchase(purchaseContext!.entryId, price, purchaseMonth)}
    onclose={() => (purchaseEntryId = null)}
  />
{/if}

<style>
  .allocation-screen {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
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
  .category-header {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    width: 100%;
    padding: 0.5rem 1rem;
    background: #f1f3f5;
    border: none;
    border-bottom: 1px solid #dee2e6;
    font-size: 0.85rem;
    font-weight: 600;
    color: #495057;
    text-align: left;
    cursor: pointer;
    user-select: none;
  }
  .category-header.collapsed {
    border-bottom: 2px solid #ced4da;
  }
  .category-header:hover {
    background: #e9ecef;
  }
  .category-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .category-subtotal {
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  /* Always visible. It used to fade in on hover so a header read as a label
     rather than a control — but a touchscreen has no hover, so the only hint
     that a category folds was invisible on exactly the devices where a long list
     most needs folding. A muted colour keeps the restraint without hiding the
     affordance. */
  .category-chevron {
    display: inline-flex;
    align-items: center;
    color: #adb5bd;
    opacity: 1;
    transition: color 0.15s, transform 0.15s;
  }
  .category-header.collapsed .category-chevron {
    transform: rotate(-90deg);
  }
  .category-header:hover .category-chevron,
  .category-header:focus-visible .category-chevron,
  .category-header.collapsed .category-chevron {
    color: #495057;
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

  @media (hover: none) and (pointer: coarse) {
    .category-chevron {
      opacity: 1;
    }
  }

  @media (max-width: 640px) {
    .category-header {
      min-height: 40px;
    }
  }
</style>
