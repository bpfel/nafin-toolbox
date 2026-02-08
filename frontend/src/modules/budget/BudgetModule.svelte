<script lang="ts">
  import {
    fetchBudgetCategories,
    fetchBudgetPeriod,
    upsertBudgetEntry,
    copyBudgetPeriod,
    createBudgetPeriod,
    type BudgetPeriodSummary,
    type BudgetCategory,
  } from '../../lib/api/client'
  import MonthSelector from './MonthSelector.svelte'
  import BudgetSummary from './BudgetSummary.svelte'
  import BudgetTable from './BudgetTable.svelte'
  import BudgetSetup from './BudgetSetup.svelte'

  let now = new Date()
  let currentYear = now.getFullYear()
  let currentMonth = now.getMonth() + 1
  // Max navigable: one month after current
  let maxYear = currentMonth === 12 ? currentYear + 1 : currentYear
  let maxMonth = currentMonth === 12 ? 1 : currentMonth + 1

  let year = $state(currentYear)
  let month = $state(currentMonth)

  let categories = $state<BudgetCategory[]>([])
  let summary = $state<BudgetPeriodSummary | null>(null)
  let needsSetup = $state(false)
  let periodNotFound = $state(false)
  let isPastMonth = $derived(year < currentYear || (year === currentYear && month < currentMonth))
  let error = $state<string | null>(null)
  let loading = $state(true)

  async function loadData() {
    loading = true
    error = null
    periodNotFound = false
    needsSetup = false
    try {
      categories = await fetchBudgetCategories()
      try {
        summary = await fetchBudgetPeriod(year, month)
      } catch {
        // No period for this month
        if (categories.length === 0) {
          needsSetup = true
          loading = false
          return
        }
        // Past months: don't fabricate history
        if (isPastMonth) {
          periodNotFound = true
          summary = null
          return
        }
        // Current/future months: auto-create by copying from previous
        await autoCreatePeriod()
      }
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load budget'
    } finally {
      loading = false
    }
  }

  async function autoCreatePeriod() {
    let prevYear = month === 1 ? year - 1 : year
    let prevMonth = month === 1 ? 12 : month - 1
    try {
      summary = await copyBudgetPeriod(year, month, {
        from_year: prevYear,
        from_month: prevMonth,
      })
    } catch {
      // No previous month to copy — create empty period
      await createBudgetPeriod(year, month)
      summary = await fetchBudgetPeriod(year, month)
    }
  }

  function changeMonth(y: number, m: number) {
    year = y
    month = m
  }

  $effect(() => {
    year; month;
    loadData()
  })

  async function handleSave(categoryId: number, field: 'planned' | 'actual', amount: string) {
    try {
      const entry: { category_id: number; planned_amount?: string; actual_amount?: string } = {
        category_id: categoryId,
      }
      if (field === 'planned') {
        entry.planned_amount = amount
      } else {
        entry.actual_amount = amount
      }
      await upsertBudgetEntry(year, month, entry)
      summary = await fetchBudgetPeriod(year, month)
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to save'
    }
  }

</script>

<div class="budget-module">
  <MonthSelector {year} {month} {maxYear} {maxMonth} onchange={changeMonth} />

  {#if loading}
    <p class="loading">Loading...</p>
  {:else if error}
    <p class="error">{error}</p>
  {:else if needsSetup}
    <BudgetSetup onseeded={loadData} />
  {:else if periodNotFound}
    <div class="no-period">
      <p>No budget was recorded for this month.</p>
    </div>
  {:else if summary}
    {#if summary.entries.length > 0}
      <BudgetSummary {summary} />
    {/if}
    <BudgetTable entries={summary.entries} onsave={handleSave} oncategorycreated={loadData} oncategorydeleted={loadData} />
  {/if}
</div>

<style>
  .budget-module {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }
  .loading {
    color: #888;
    text-align: center;
    padding: 2rem;
  }
  .error {
    color: #c0392b;
    padding: 1rem;
    background: #fdecea;
    border-radius: 6px;
  }
  .no-period {
    text-align: center;
    padding: 3rem 2rem;
    background: white;
    border-radius: 8px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }
  .no-period p {
    color: #666;
  }
</style>
