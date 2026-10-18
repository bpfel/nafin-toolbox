<script lang="ts">
  import Sheet from '../../lib/nav/Sheet.svelte'
  import { t, tn, tAround } from '../../lib/i18n/index.svelte'
  import { untrack } from 'svelte'
  import type { VaultCategory, VaultData } from '../../lib/crypto/vault'
  import * as engine from '../../lib/budget/budgetEngine'
  import { commit } from '../../lib/crypto/vaultStore.svelte'

  interface Props {
    category: VaultCategory
    vault: VaultData
    onsaved: () => void
    onclose: () => void
  }

  let { category, vault, onsaved, onclose }: Props = $props()

  // Seeded once: the dialog is created fresh each time it opens.
  let name = $state(untrack(() => category.name))
  let side = $state<'income' | 'expense'>(untrack(() => category.side))
  let error = $state<string | null>(null)

  let trimmed = $derived(name.trim())
  let members = $derived(engine.entriesInCategory(vault, category.id))
  let movingSides = $derived(side !== category.side)

  // A reserve is an expense idea — it says money is being set aside towards a
  // target. updateEntry drops it on the way to income, so say so first.
  let reservesLost = $derived(
    movingSides && side === 'income' ? members.filter(c => c.reserve).length : 0,
  )

  let conflict = $derived(
    trimmed === '' ? null : engine.findCategoryConflict(vault, category.id, trimmed, side),
  )

  let changed = $derived(trimmed !== category.name || movingSides)

  // Whole sentences with a slot, split only for rendering — see tAround.
  let conflictParts = $derived(
    tAround(side === 'income' ? 'category.conflictIncome' : 'category.conflictExpense', 'name'),
  )
  let mergeParts = $derived(
    tAround(
      members.length === 1 ? 'category.mergeExplain.one' : 'category.mergeExplain.other',
      'name',
      { count: members.length },
    ),
  )

  // Deleted elsewhere while this form was open. See AddEntryModal.
  let gone = $derived(!vault.budget.categories.some(c => c.id === category.id))

  function save() {
    error = null
    try {
      commit('updateCategory', category.id, { name: trimmed, side })
      onsaved()
      onclose()
    } catch (e) {
      error = e instanceof Error ? e.message : t('error.saveCategory')
    }
  }

  function merge() {
    if (!conflict) return
    commit('mergeCategory', category.id, conflict.id)
    onsaved()
    onclose()
  }


</script>

<Sheet label={t('category.editTitle')} {onclose}>
  <h3>{t('category.editTitle')}</h3>

  <label class="field">
    <span class="label">{t('field.name')}</span>
    <input type="text" bind:value={name} onkeydown={(e) => e.key === 'Enter' && !conflict && save()} />
  </label>

  <label class="field">
    <span class="label">{t('category.type')}</span>
    <select bind:value={side}>
      <option value="income">{t('budget.income')}</option>
      <option value="expense">{t('budget.expenses')}</option>
    </select>
  </label>

  {#if movingSides}
    <div class="notice">
      <p>
        {tn('category.movingSides', members.length, {
          type: side === 'income' ? t('category.typeIncome') : t('category.typeExpense'),
        })}
        {#if reservesLost > 0}
          {tn('category.reservesLost', reservesLost)}
        {/if}
      </p>
    </div>
  {/if}

  {#if conflict}
    <div class="notice">
      <p>
        {conflictParts[0]}<strong>{conflict.name}</strong>{conflictParts[1]}
      </p>
      <p>
        {mergeParts[0]}<strong>{category.name}</strong>{mergeParts[1]}
      </p>
    </div>
  {/if}

  {#if error}
    <p class="error" role="alert">{error}</p>
  {/if}

  {#if gone}
    <p class="error" role="alert">{t('sync.goneElsewhere')}</p>
  {/if}

  <div class="actions">
    <button class="btn cancel" onclick={onclose}>{gone ? t('action.close') : t('action.cancel')}</button>
    {#if gone}
      <!-- Nothing to save into. -->
    {:else if conflict}
      <button class="btn merge" onclick={merge}>{t('category.mergeInto', { name: conflict.name })}</button>
    {:else}
      <button class="btn save" onclick={save} disabled={!changed || trimmed === ''}>{t('action.save')}</button>
    {/if}
  </div>
</Sheet>

<style>
  h3 {
    margin: 0;
    font-size: 1.1rem;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .label {
    font-size: 0.85rem;
    font-weight: 500;
    color: #333;
  }
  .field input,
  .field select {
    padding: 0.6rem 0.75rem;
    border: 1px solid #ccc;
    border-radius: 6px;
    font-size: 1rem;
    outline: none;
  }
  .field input:focus,
  .field select:focus {
    border-color: #2d6a4f;
    box-shadow: 0 0 0 2px rgba(45, 106, 79, 0.2);
  }
  .notice {
    background: #fff8e6;
    border: 1px solid #f0e0b0;
    border-radius: 6px;
    padding: 0.75rem;
  }
  .notice p {
    margin: 0;
    font-size: 0.85rem;
    color: #6b5518;
    line-height: 1.4;
  }
  .notice p + p {
    margin-top: 0.5rem;
  }
  .error {
    color: var(--alarm);
    font-size: 0.85rem;
    padding: 0.4rem 0.6rem;
    background: var(--alarm-soft);
    border-radius: 6px;
    margin: 0;
  }
  .actions {
    display: flex;
    gap: 0.75rem;
    justify-content: flex-end;
  }
  .merge {
    background: #b26a00;
    border: none;
    color: white;
  }
  .merge:hover:not(:disabled) {
    background: #925700;
  }
</style>
