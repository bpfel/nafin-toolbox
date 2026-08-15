<script lang="ts">
  import { getVaultState, markDirty } from '../../lib/crypto/vaultStore.svelte'
  import * as engine from '../../lib/budget/budgetEngine'
  import BudgetSummary from './BudgetSummary.svelte'
  import BudgetTable from './BudgetTable.svelte'
  import BudgetSetup from './BudgetSetup.svelte'
  import ArchivePanel from './ArchivePanel.svelte'

  const vaultState = getVaultState()

  // Trigger reactivity: increment on mutations so $derived recomputes, since the
  // engine mutates the vault in place where runes cannot see it.
  let version = $state(0)

  // "Start blank" has nothing to create — there is one plan and it already
  // exists — so it only means "stop offering me the defaults".
  let dismissedSetup = $state(false)

  let needsSetup = $derived(
    vaultState.vault
      ? vaultState.vault.budget.categories.length === 0 && !dismissedSetup && version >= 0
      : false
  )

  let summary = $derived(
    vaultState.vault && version >= 0 ? engine.getPlanSummary(vaultState.vault) : null
  )

  function handleSave(categoryId: string, amount: string) {
    if (!vaultState.vault) return
    engine.setPlanned(vaultState.vault, categoryId, amount)
    markDirty()
    version++
  }

  function handleCategoryChange() {
    markDirty()
    version++
  }

  function handleSeeded() {
    if (!vaultState.vault) return
    engine.seedDefaults(vaultState.vault)
    markDirty()
    version++
  }

  function handleStartBlank() {
    dismissedSetup = true
  }
</script>

<div class="budget-module">
  {#if !vaultState.vault}
    <p class="loading">Loading...</p>
  {:else if needsSetup}
    <BudgetSetup onseeded={handleSeeded} onstartblank={handleStartBlank} />
  {:else if summary}
    {#if summary.entries.length > 0}
      <BudgetSummary {summary} />
    {/if}
    <BudgetTable
      entries={summary.entries}
      vault={vaultState.vault}
      onsave={handleSave}
      oncategorycreated={handleCategoryChange}
      oncategorydeleted={handleCategoryChange}
    />
    <ArchivePanel vault={vaultState.vault} />
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
</style>
