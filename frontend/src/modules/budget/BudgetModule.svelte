<script lang="ts">
  import { getVaultState, markDirty } from '../../lib/crypto/vaultStore.svelte'
  import * as engine from '../../lib/budget/budgetEngine'
  import MonthSelector from './MonthSelector.svelte'
  import BudgetSummary from './BudgetSummary.svelte'
  import BudgetTable from './BudgetTable.svelte'
  import BudgetWizard from './wizard/BudgetWizard.svelte'
  import { generateCategories, calculateBudget, type WizardData } from './wizard/wizardCalculations'

  const vaultState = getVaultState()

  let now = new Date()
  let currentYear = now.getFullYear()
  let currentMonth = now.getMonth() + 1
  let maxYear = currentMonth === 12 ? currentYear + 1 : currentYear
  let maxMonth = currentMonth === 12 ? 1 : currentMonth + 1

  let year = $state(currentYear)
  let month = $state(currentMonth)

  // Trigger reactivity: increment on mutations so $derived recomputes
  let version = $state(0)

  let isPastMonth = $derived(year < currentYear || (year === currentYear && month < currentMonth))

  let needsSetup = $derived(
    vaultState.vault ? vaultState.vault.budget.categories.length === 0 && version >= 0 : false
  )

  let summary = $derived(
    vaultState.vault && version >= 0 ? engine.getPeriodSummary(vaultState.vault, year, month) : null
  )

  let periodNotFound = $derived(!summary && !needsSetup && isPastMonth)

  function changeMonth(y: number, m: number) {
    year = y
    month = m
  }

  // Auto-create period for current/future months
  $effect(() => {
    if (!vaultState.vault) return
    const s = engine.getPeriodSummary(vaultState.vault, year, month)
    if (!s && !isPastMonth && vaultState.vault.budget.categories.length > 0) {
      let prevYear = month === 1 ? year - 1 : year
      let prevMonth = month === 1 ? 12 : month - 1
      engine.copyPeriod(vaultState.vault, year, month, prevYear, prevMonth)
      if (!engine.getPeriod(vaultState.vault, year, month)) {
        engine.createPeriod(vaultState.vault, year, month)
      }
      markDirty()
      version++
    }
  })

  function handleSave(categoryId: string, field: 'planned' | 'actual', amount: string) {
    if (!vaultState.vault) return
    engine.upsertEntry(vaultState.vault, year, month, categoryId, field, amount)
    markDirty()
    version++
  }

  function handleCategoryChange() {
    markDirty()
    version++
  }

  function handleWizardComplete(data: WizardData) {
    if (!vaultState.vault) return
    // Calculate full budget allocation from wizard data
    const budgetAllocation = calculateBudget(data)
    // Generate categories from the calculated budget
    const categories = generateCategories(budgetAllocation, data)
    engine.seedFromWizard(vaultState.vault, categories)
    markDirty()
    version++
  }

  function handleQuickSetup() {
    if (!vaultState.vault) return
    engine.seedDefaults(vaultState.vault)
    markDirty()
    version++
  }
</script>

<div class="budget-module">
  <MonthSelector {year} {month} {maxYear} {maxMonth} onchange={changeMonth} />

  {#if !vaultState.vault}
    <p class="loading">Loading...</p>
  {:else if needsSetup}
    <BudgetWizard oncomplete={handleWizardComplete} onquicksetup={handleQuickSetup} />
  {:else if periodNotFound}
    <div class="no-period">
      <p>No budget was recorded for this month.</p>
    </div>
  {:else if summary}
    {#if summary.entries.length > 0}
      <BudgetSummary {summary} />
    {/if}
    <BudgetTable
      entries={summary.entries}
      vault={vaultState.vault}
      {year}
      {month}
      onsave={handleSave}
      oncategorycreated={handleCategoryChange}
      oncategorydeleted={handleCategoryChange}
    />
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
