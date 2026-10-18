<script lang="ts">
  import { t, getLocale } from '../../lib/i18n/index.svelte'
  import { getVaultState, commit } from '../../lib/crypto/vaultStore.svelte'
  import * as engine from '../../lib/budget/budgetEngine'
  import BudgetSummary from './BudgetSummary.svelte'
  import BudgetTable from './BudgetTable.svelte'
  import BudgetSetup from './BudgetSetup.svelte'
  import VersionStepper from './VersionStepper.svelte'
  import PastVersion from './PastVersion.svelte'
  import VersionChanges from './VersionChanges.svelte'
  import { planVersions } from '../../lib/budget/versions'
  import { monthLabel } from '../../lib/util/months'
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
    commit('setPlanned', entryId, amount)
    version++
  }

  // The change itself was committed where it was made; this only redraws.
  function handleEntryChange() {
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
    commit(household ? 'seedSharedDefaults' : 'seedDefaults', getLocale())
    version++
  }

  function handleStartBlank() {
    dismissedSetup = true
  }

  // Monthly or yearly, owned by the screen: the control that flips it sits in
  // the action strip, and the summary and the table both answer to it.
  interface Props {
    viewMode?: 'monthly' | 'yearly'
    /** Showing an earlier version: the screen hides what would change the plan. */
    past?: boolean
  }

  let { viewMode = $bindable('monthly'), past = $bindable(false) }: Props = $props()

  /**
   * The plan's versions, newest first — the plan now, then each one before a
   * change. Stepped through from the stepper above the plan. See `planVersions`.
   */
  let versions = $derived(vaultState.vault && version >= 0 ? planVersions(vaultState.vault) : [])
  let index = $state(0)
  let shown = $derived(versions[Math.min(index, versions.length - 1)])
  $effect(() => {
    past = index > 0
  })
  // Another budget, another history: start again at its plan now.
  $effect(() => {
    void vaultState.currentVaultId
    index = 0
  })

  function range(from: string | undefined, to: string | null): string {
    if (!from) return ''
    if (to === null) return t('budget.since', { month: monthLabel(from) })
    return from === to ? monthLabel(from) : `${monthLabel(from)} – ${monthLabel(to)}`
  }

  let stepTitle = $derived(!shown ? '' : shown.to === null ? t('budget.currentPlan') : range(shown.from, shown.to))
  let stepSub = $derived(!shown || shown.to !== null ? undefined : range(shown.from, null) || undefined)

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
    commit('resetBudget')
    // An empty budget is exactly the state the setup screen exists for, so the
    // offer of the defaults comes back rather than leaving a blank table.
    dismissedSetup = false
    version++
  }
</script>

<div class="budget-module">
  {#if !vaultState.vault}
    <p class="loading">{t('state.loading')}</p>
  {:else if needsSetup && vaultState.readOnly}
    <!--
      The setup screen offers to write the defaults, which a reader cannot do —
      and pressing it used to end in "Something broke". An empty budget they
      may only look at still needs saying so, or it reads as a page that failed
      to load.
    -->
    <p class="read-only-empty">{t('budget.readOnlyEmpty')}</p>
  {:else if needsSetup}
    <BudgetSetup onseeded={handleSeeded} onstartblank={handleStartBlank} {household} />
  {:else if summary}
    {#if versions.length > 1}
      <VersionStepper
        title={stepTitle}
        sub={stepSub}
        onprevious={index < versions.length - 1 ? () => index++ : undefined}
        onnext={index > 0 ? () => index-- : undefined}
      />
    {/if}
    {#if shown && shown.changes.length > 0}
      <VersionChanges changes={shown.changes} />
    {/if}
    {#if shown && shown.copy}
      <PastVersion copy={shown.copy} />
    {:else}
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
    {/if}

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
  .read-only-empty {
    margin: 2rem auto;
    max-width: 28rem;
    text-align: center;
    color: var(--ink-muted);
    line-height: 1.5;
  }

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
