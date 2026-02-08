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
  import BudgetPlanManager from './BudgetPlanManager.svelte'

  let now = new Date()
  let year = $state(now.getFullYear())
  let month = $state(now.getMonth() + 1)

  let categories = $state<BudgetCategory[]>([])
  let summary = $state<BudgetPeriodSummary | null>(null)
  let needsSetup = $state(false)
  let periodNotFound = $state(false)
  let error = $state<string | null>(null)
  let loading = $state(true)
  let activeView = $state<'monthly' | 'plans'>('monthly')

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
    if (activeView === 'monthly') {
      loadData()
    }
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
      await createBudgetPeriod(year, month)
      summary = await fetchBudgetPeriod(year, month)
      periodNotFound = false
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to create period'
    }
  }

  async function handleCopyFromPrevious() {
    try {
      let prevYear = month === 1 ? year - 1 : year
      let prevMonth = month === 1 ? 12 : month - 1
      summary = await copyBudgetPeriod(year, month, {
        from_year: prevYear,
        from_month: prevMonth,
      })
      periodNotFound = false
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to copy from previous month'
    }
  }
</script>

<div class="budget-module">
  <div class="view-toggle">
    <button
      class="toggle-btn"
      class:active={activeView === 'monthly'}
      onclick={() => { activeView = 'monthly'; loadData() }}
    >
      Monthly
    </button>
    <button
      class="toggle-btn"
      class:active={activeView === 'plans'}
      onclick={() => { activeView = 'plans' }}
    >
      Plan Templates
    </button>
  </div>

  {#if activeView === 'plans'}
    <BudgetPlanManager />
  {:else}
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
        <div class="period-actions">
          <button class="primary" onclick={handleCreatePeriod}>
            Create from plan template
          </button>
          <button class="secondary" onclick={handleCopyFromPrevious}>
            Copy from previous month
          </button>
        </div>
      </div>
    {:else if summary}
      <BudgetSummary {summary} />
      <BudgetTable entries={summary.entries} onsave={handleSave} />
    {/if}
  {/if}
</div>

<style>
  .budget-module {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }
  .view-toggle {
    display: flex;
    gap: 0;
    background: #e9ecef;
    border-radius: 6px;
    padding: 2px;
    width: fit-content;
  }
  .toggle-btn {
    padding: 0.4rem 1rem;
    border: none;
    background: transparent;
    border-radius: 4px;
    font-size: 0.85rem;
    color: #666;
    cursor: pointer;
  }
  .toggle-btn.active {
    background: white;
    color: #1a1a2e;
    font-weight: 600;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
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
  .period-actions {
    display: flex;
    gap: 0.75rem;
    justify-content: center;
  }
  .period-actions button.primary {
    background: #2d6a4f;
    color: white;
  }
  .period-actions button.primary:hover {
    background: #245a42;
  }
  .period-actions button.secondary {
    background: #e9ecef;
    color: #1a1a2e;
  }
  .period-actions button.secondary:hover {
    background: #dee2e6;
  }
</style>
