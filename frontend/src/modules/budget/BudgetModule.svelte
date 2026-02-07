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
  let year = $state(now.getFullYear())
  let month = $state(now.getMonth() + 1)

  let categories = $state<BudgetCategory[]>([])
  let summary = $state<BudgetPeriodSummary | null>(null)
  let needsSetup = $state(false)
  let periodNotFound = $state(false)
  let error = $state<string | null>(null)
  let loading = $state(true)

  async function loadData() {
    loading = true
    error = null
    periodNotFound = false
    needsSetup = false
    try {
      categories = await fetchBudgetCategories()
      if (categories.length === 0) {
        needsSetup = true
        loading = false
        return
      }
      try {
        summary = await fetchBudgetPeriod(year, month)
      } catch {
        periodNotFound = true
        summary = null
      }
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load budget'
    } finally {
      loading = false
    }
  }

  function changeMonth(y: number, m: number) {
    year = y
    month = m
  }

  $effect(() => {
    // Re-run whenever year/month changes
    year; month;
    loadData()
  })

  async function handleSave(categoryId: number, amount: string) {
    try {
      await upsertBudgetEntry(year, month, { category_id: categoryId, amount })
      summary = await fetchBudgetPeriod(year, month)
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to save'
    }
  }

  async function handleCreatePeriod() {
    try {
      await createBudgetPeriod(year, month)
      // Try to copy from previous month
      let prevYear = month === 1 ? year - 1 : year
      let prevMonth = month === 1 ? 12 : month - 1
      try {
        summary = await copyBudgetPeriod(year, month, {
          from_year: prevYear,
          from_month: prevMonth,
        })
        periodNotFound = false
      } catch {
        // No previous period to copy from, just load the empty one
        summary = await fetchBudgetPeriod(year, month)
        periodNotFound = false
      }
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to create period'
    }
  }
</script>

<div class="budget-module">
  <MonthSelector {year} {month} onchange={changeMonth} />

  {#if loading}
    <p class="loading">Loading...</p>
  {:else if error}
    <p class="error">{error}</p>
  {:else if needsSetup}
    <BudgetSetup onseeded={loadData} />
  {:else if periodNotFound}
    <div class="no-period">
      <p>No budget for this month yet.</p>
      <button onclick={handleCreatePeriod}>
        Create from previous month
      </button>
    </div>
  {:else if summary}
    <BudgetSummary {summary} />
    <BudgetTable entries={summary.entries} onsave={handleSave} />
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
    margin-bottom: 1rem;
  }
</style>
