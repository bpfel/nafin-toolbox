<script lang="ts">
  import { t, getLocale } from '../../lib/i18n/index.svelte'
  import { getVaultState, markDirty } from '../../lib/crypto/vaultStore.svelte'
  import * as engine from '../../lib/budget/budgetEngine'
  import BudgetSummary from './BudgetSummary.svelte'
  import BudgetTable from './BudgetTable.svelte'
  import BudgetSetup from './BudgetSetup.svelte'
  import SnapshotPanel from './SnapshotPanel.svelte'
  import ResetBudgetModal from './ResetBudgetModal.svelte'
  import { isEditing } from '../../lib/util/editMode.svelte'

  const vaultState = getVaultState()

  // Trigger reactivity: increment on mutations so $derived recomputes, since the
  // engine mutates the vault in place where runes cannot see it.
  let version = $state(0)

  // "Start blank" has nothing to create — there is one plan and it already
  // exists — so it only means "stop offering me the defaults".
  let dismissedSetup = $state(false)

  let needsSetup = $derived(
    vaultState.vault
      ? vaultState.vault.budget.entries.length === 0 && !dismissedSetup && version >= 0
      : false
  )

  let summary = $derived(
    vaultState.vault && version >= 0 ? engine.getPlanSummary(vaultState.vault) : null
  )

  function handleSave(entryId: string, amount: string) {
    if (!vaultState.vault) return
    engine.setPlanned(vaultState.vault, entryId, amount)
    markDirty()
    version++
  }

  function handleEntryChange() {
    markDirty()
    version++
  }

  /**
   * Which starter budget. A household gets the two-person one, whose income
   * side is contributions rather than a salary — seeding a personal plan into
   * a shared vault would put one person's wage in front of both of them.
   */
  const household = $derived(vaultState.currentHousehold !== null)

  function handleSeeded() {
    if (!vaultState.vault) return
    const seed = household ? engine.seedSharedDefaults : engine.seedDefaults
    seed(vaultState.vault, getLocale())
    markDirty()
    version++
  }

  function handleStartBlank() {
    dismissedSetup = true
  }

  // Monthly or yearly, owned by the screen: the control that flips it sits in
  // the action strip, and the summary and the table both answer to it.
  interface Props {
    viewMode?: 'monthly' | 'yearly'
  }

  let { viewMode = $bindable('monthly') }: Props = $props()

  /**
   * Passed straight through from the screen's "+" to the table that owns the
   * form. The module is in the middle of that chain and holds nothing of its
   * own here — the button belongs with the screen's other controls, the form
   * belongs with the vault it writes to.
   */
  let table = $state<{ openAddEntry: () => void } | null>(null)

  export function openAddEntry() {
    table?.openAddEntry()
  }

  let confirmingReset = $state(false)

  function handleReset() {
    if (!vaultState.vault) return
    engine.resetBudget(vaultState.vault)
    // An empty budget is exactly the state the setup screen exists for, so the
    // offer of the defaults comes back rather than leaving a blank table.
    dismissedSetup = false
    markDirty()
    version++
  }
</script>

<div class="budget-module">
  {#if !vaultState.vault}
    <p class="loading">{t('state.loading')}</p>
  {:else if needsSetup}
    <BudgetSetup onseeded={handleSeeded} onstartblank={handleStartBlank} {household} />
  {:else if summary}
    {#if isEditing('budget') && summary.entries.length > 0}
      <div class="module-actions">
        <button class="btn-reset" onclick={() => confirmingReset = true}>{t('budget.reset')}</button>
      </div>
    {/if}
    {#if summary.entries.length > 0}
      <BudgetSummary {summary} {viewMode} />
    {/if}
    <BudgetTable
      bind:this={table}
      bind:viewMode
      entries={summary.entries}
      vault={vaultState.vault}
      onsave={handleSave}
      onentrycreated={handleEntryChange}
      onentrydeleted={handleEntryChange}
      oncategorychanged={handleEntryChange}
    />
    <SnapshotPanel vault={vaultState.vault} />

    {#if confirmingReset}
      <ResetBudgetModal
        entryCount={vaultState.vault.budget.entries.length}
        snapshotCount={vaultState.vault.budget.snapshots.length}
        onreset={handleReset}
        onclose={() => confirmingReset = false}
      />
    {/if}
  {/if}
</div>

<style>
  .budget-module {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }
  .module-actions {
    display: flex;
    justify-content: flex-end;
    /* The module already spaces its children generously; the bar belongs to the
       table below it rather than floating alone. */
    margin-bottom: -1rem;
  }
  .btn-reset {
    background: white;
    color: #c0392b;
    border: 1px solid #c0392b;
    padding: 0.3rem 0.8rem;
    font-size: 0.8rem;
    border-radius: 6px;
    cursor: pointer;
  }
  .btn-reset:hover {
    background: #fdecea;
  }
  .loading {
    color: var(--ink-faint);
    text-align: center;
    padding: 2rem;
  }
</style>
