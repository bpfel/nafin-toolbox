<script lang="ts">
  import { getVaultState, markDirty } from '../../../lib/crypto/vaultStore.svelte'
  import * as engine from '../../../lib/budget/budgetEngine'
  import type {
    ReserveDefinition,
    VaultCategory,
    VaultCategoryGroup,
    VaultData,
  } from '../../../lib/crypto/vault'
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

  // The monthly flow view: which budget lines move money from where to where,
  // and what accumulates this month.
  //
  // Reads the budget's categories and planned amounts but never writes them —
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

  // What a row needs to render. The category is a snapshot, never the vault's
  // own object — see `rows` below for why that matters.
  interface RowView {
    category: VaultCategory
    plannedAmount: string
    sinkAvailable: string | null
  }

  interface RowGroup {
    groupId: string
    groupName: string
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

  // Planned amounts come from the standing plan, read-only. A category the plan
  // has no line for reads as zero rather than having one created here.
  let plannedById = $derived.by(() => {
    void version
    const map = new Map<string, string>()
    const vault = vaultState.vault
    if (!vault) return map
    for (const entry of engine.getPlanSummary(vault).entries) {
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
  let rows = $derived.by((): RowView[] => {
    void version
    return categories.map(category => ({
      category: { ...category },
      plannedAmount: plannedFor(category.id),
      sinkAvailable: sinkAvailable(category.sinkAccountId),
    }))
  })

  let incomeRows = $derived(rows.filter(r => r.category.type === 'income'))
  let expenseRows = $derived(rows.filter(r => r.category.type === 'expense'))

  // --- Grouping ----------------------------------------------------------
  // Same shape as the budget table: rows are grouped by their budget group and
  // ordered by the group's own `sortOrder`, so a user who has arranged their
  // groups in the budget sees that same arrangement here.

  let groupsById = $derived.by((): Map<string, VaultCategoryGroup> => {
    void version
    const vault = vaultState.vault
    if (!vault) return new Map()
    return new Map(engine.listGroups(vault).map(g => [g.id, g]))
  })

  function groupOrder(groupId: string): number {
    return groupsById.get(groupId)?.sortOrder ?? Number.MAX_SAFE_INTEGER
  }

  // A category whose group was deleted still has to show up, so an unknown
  // group id collapses into the unnamed "Other" bucket that sorts last.
  function groupRows(list: RowView[]): RowGroup[] {
    const map = new Map<string, { groupId: string; groupName: string; rows: RowView[]; cents: number }>()
    for (const row of list) {
      const group = groupsById.get(row.category.groupId)
      const name = group?.name ?? ''
      let bucket = map.get(name)
      if (!bucket) {
        bucket = { groupId: group?.id ?? '', groupName: name, rows: [], cents: 0 }
        map.set(name, bucket)
      }
      bucket.rows.push(row)
      bucket.cents += cents(row.plannedAmount)
    }
    return Array.from(map.values())
      .sort((a, b) => groupOrder(a.groupId) - groupOrder(b.groupId))
      .map(b => ({
        groupId: b.groupId,
        groupName: b.groupName,
        rows: b.rows,
        plannedTotal: fromCents(b.cents),
      }))
  }

  let incomeGroups = $derived(groupRows(incomeRows))
  let expenseGroups = $derived(groupRows(expenseRows))

  // Collapse is a view preference of this screen alone: not persisted, not
  // shared with the budget table. Keyed by type so "Other" under income and
  // "Other" under expenses fold independently.
  let collapsedGroups = $state(new Set<string>())

  function toggleGroup(type: 'income' | 'expense', groupName: string) {
    const key = `${type}:${groupName}`
    const next = new Set(collapsedGroups)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    collapsedGroups = next
  }

  function isCollapsed(type: 'income' | 'expense', groupName: string): boolean {
    return collapsedGroups.has(`${type}:${groupName}`)
  }

  // A lone unnamed group is not a grouping — showing a header for it would add
  // a row of chrome that says nothing. Matches the budget table.
  function showsHeaders(groups: RowGroup[]): boolean {
    return groups.length > 1 || groups[0]?.groupName !== ''
  }

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

{#snippet groupBlock(type: 'income' | 'expense', group: RowGroup, withHeader: boolean)}
  <div class="group">
    {#if withHeader}
      <button
        type="button"
        class="group-header"
        class:collapsed={isCollapsed(type, group.groupName)}
        data-testid="allocation-group"
        aria-expanded={!isCollapsed(type, group.groupName)}
        onclick={() => toggleGroup(type, group.groupName)}
      >
        <span class="group-chevron">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
            <path d="M2 4 L6 10 L10 4 Z" />
          </svg>
        </span>
        <span class="group-name">{group.groupName || 'Other'}</span>
        <span class="group-subtotal">CHF {money(group.plannedTotal)}</span>
      </button>
    {/if}
    {#if !withHeader || !isCollapsed(type, group.groupName)}
      <div class="rows">
        {#each group.rows as row (row.category.id)}
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
    {/if}
  </div>
{/snippet}

<div class="allocation-screen">
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

    {#if incomeGroups.length > 0}
      <section class="flow-section">
        <h3>Money in</h3>
        {#each incomeGroups as group (group.groupName)}
          {@render groupBlock('income', group, showsHeaders(incomeGroups))}
        {/each}
      </section>
    {/if}

    {#if expenseGroups.length > 0}
      <section class="flow-section">
        <h3>Money out and money set aside</h3>
        {#each expenseGroups as group (group.groupName)}
          {@render groupBlock('expense', group, showsHeaders(expenseGroups))}
        {/each}
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
  .group-header {
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
  .group-header.collapsed {
    border-bottom: 2px solid #ced4da;
  }
  .group-header:hover {
    background: #e9ecef;
  }
  .group-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .group-subtotal {
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  /* The chevron stays faint until the header is hovered or the group is folded,
     so a header reads as a label rather than a control. Same as the budget. */
  .group-chevron {
    display: inline-flex;
    align-items: center;
    color: #868e96;
    opacity: 0;
    transition: opacity 0.15s, transform 0.15s;
  }
  .group-header.collapsed .group-chevron {
    transform: rotate(-90deg);
  }
  .group-header:hover .group-chevron,
  .group-header:focus-visible .group-chevron,
  .group-header.collapsed .group-chevron {
    opacity: 1;
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
    .group-chevron {
      opacity: 1;
    }
  }

  @media (max-width: 640px) {
    .group-header {
      min-height: 40px;
    }
  }
</style>
