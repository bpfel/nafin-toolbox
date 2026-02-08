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

  async function handleCreatePeriod() {
    try {
      // Try copying from previous month first
      let prevYear = month === 1 ? year - 1 : year
      let prevMonth = month === 1 ? 12 : month - 1
      try {
        summary = await copyBudgetPeriod(year, month, {
          from_year: prevYear,
          from_month: prevMonth,
        })
      } catch {
        // No previous month — create empty period
        await createBudgetPeriod(year, month)
        summary = await fetchBudgetPeriod(year, month)
      }
      periodNotFound = false
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to create budget'
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
      {#if isPastMonth}
        <p>No budget was recorded for this month.</p>
      {:else}
        <p>No budget for this month yet.</p>
        <button class="create-btn" onclick={handleCreatePeriod}>
          Create budget
        </button>
      {/if}
    </div>
  {:else if summary}
    <BudgetSummary {summary} />
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
    margin-bottom: 1rem;
  }
  .create-btn {
    background: #2d6a4f;
    color: white;
  }
  .create-btn:hover {
    background: #245a42;
  }
</style>
