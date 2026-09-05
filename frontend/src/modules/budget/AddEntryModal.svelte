<script lang="ts">
  import { t } from '../../lib/i18n/index.svelte'
  import { untrack } from 'svelte'
  import * as engine from '../../lib/budget/budgetEngine'
  import { sideOf, type EntryType, type VaultData } from '../../lib/crypto/vault'
  import { focusTrap } from '../../lib/util/focusTrap'
  import { formatAmount, parseAmount } from '../../lib/util/money'

  interface Props {
    /** The side the "+" was pressed on, and the type the dialog opens with. */
    type: EntryType
    categories: { name: string; id: string }[]
    editEntry?: { id: string; name: string; categoryName: string; plannedAmount?: string } | null
    /** Preselects the category when adding — set by the "+" on a category header. */
    presetCategoryName?: string
    vault: VaultData
    oncreated: () => void
    onclose: () => void
    onsave?: (entryId: string, amount: string) => void
    /**
     * Hands off to the delete confirmation. Only meaningful when editing, and
     * the reason the table row needs no delete control of its own on a narrow
     * screen — where there is no width for one.
     */
    ondelete?: () => void
  }

  let { type, categories, editEntry = null, presetCategoryName, vault, oncreated, onclose, onsave, ondelete }: Props = $props()

  let isEdit = $derived(editEntry != null)

  /**
   * What kind of line this is — chosen here, not on a later screen.
   *
   * Before v7 there were two types and the interesting distinctions lived
   * elsewhere: setting up a tax bill meant creating an expense, going to
   * Allocations, attaching a reserve and raising its duration past twelve
   * months. One question, asked once, replaces all of that.
   */
  let selectedType = $state<EntryType>(untrack(() => type))

  const TYPES_FOR_SIDE: Record<'income' | 'expense', EntryType[]> = {
    income: ['income'],
    expense: ['expense', 'savings', 'bill', 'purchase'],
  }

  let typeChoices = $derived(TYPES_FOR_SIDE[sideOf(selectedType)])

  // 'YYYY-MM'. A bill or a purchase anchors its cycle here; the engine takes it
  // as an argument rather than reading a clock of its own.
  const currentMonth = (() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })()
  // Seeded once: the modal is created fresh each time it opens, so every read of
  // `editEntry` below is deliberately an initial value rather than a reactive
  // one. `untrack` says so out loud, to Svelte and to the next reader.
  let name = $state(untrack(() => editEntry?.name ?? ''))
  let selectedCategory = $state(
    untrack(() => editEntry?.categoryName ?? presetCategoryName ?? categories[0]?.name ?? ''),
  )
  let newCategoryName = $state('')
  let useNewCategory = $state(false)
  let error = $state<string | null>(null)

  let plannedMoValue = $state(
    untrack(() => (editEntry?.plannedAmount ? formatAmount(Number(editEntry.plannedAmount)) : '')),
  )
  let plannedYrValue = $state(
    untrack(() => (editEntry?.plannedAmount ? formatAmount(Number(editEntry.plannedAmount) * 12) : '')),
  )
  let valueFocusedField = $state<'planned_mo' | 'planned_yr' | null>(null)

  function handleValueFocus(field: 'planned_mo' | 'planned_yr', event: FocusEvent) {
    valueFocusedField = field
    const input = event.target as HTMLInputElement
    requestAnimationFrame(() => input.select())
  }

  /**
   * Normalises the pair of amount fields, and on an existing entry writes the
   * value through. On a new one there is nothing to write to yet — the amount
   * travels with `createEntry` instead, so this only keeps the monthly and
   * yearly boxes agreeing with each other.
   */
  function commitValue(field: 'planned_mo' | 'planned_yr'): boolean {
    const raw = field === 'planned_mo' ? plannedMoValue : plannedYrValue
    const val = parseAmount(raw)
    if (isNaN(val) || !isFinite(val)) return false

    if (field === 'planned_mo') {
      plannedMoValue = formatAmount(val)
      plannedYrValue = formatAmount(val * 12)
      if (editEntry && onsave) onsave(editEntry.id, val.toFixed(2))
    } else {
      const monthly = val / 12
      plannedYrValue = formatAmount(val)
      plannedMoValue = formatAmount(monthly)
      if (editEntry && onsave) onsave(editEntry.id, monthly.toFixed(4))
    }
    return true
  }

  function handleValueBlur(field: 'planned_mo' | 'planned_yr') {
    valueFocusedField = null
    commitValue(field)
  }

  // Enter means done, the same as it does in the name field above. Without this
  // the amount only landed once focus moved, so the dialog sat there looking as
  // though nothing had happened.
  function handleValueKeydown(field: 'planned_mo' | 'planned_yr', e: KeyboardEvent) {
    if (e.key !== 'Enter') return
    e.preventDefault()
    // Nonsense in the field leaves the dialog open to be corrected rather than
    // closing over an amount that was never written.
    if (!commitValue(field)) return
    save()
  }

  function handleValueInput(field: 'planned_mo' | 'planned_yr') {
    const raw = field === 'planned_mo' ? plannedMoValue : plannedYrValue
    const val = parseAmount(raw)
    if (isNaN(val) || !isFinite(val)) return

    if (field === 'planned_mo') {
      plannedYrValue = formatAmount(val * 12)
    } else {
      plannedMoValue = formatAmount(val / 12)
    }
  }

  /** The monthly figure as it will be stored, or '' when the box is empty. */
  function monthlyAmount(): string {
    const value = parseAmount(plannedMoValue)
    if (plannedMoValue.trim() === '' || isNaN(value) || !isFinite(value)) return ''
    return value.toFixed(2)
  }

  let resolvedCategoryName = $derived(useNewCategory ? newCategoryName.trim() : selectedCategory)

  function save() {
    const trimmed = name.trim()
    if (!trimmed) return
    if (!isEdit && !resolvedCategoryName) return
    error = null

    try {
      if (isEdit && editEntry) {
        engine.updateEntry(vault, editEntry.id, {
          name: trimmed,
          type: selectedType,
          categoryName: resolvedCategoryName,
        })
      } else {
        engine.createEntry(vault, {
          name: trimmed,
          type: selectedType,
          categoryName: resolvedCategoryName,
          plannedAmount: monthlyAmount(),
          anchorMonth: currentMonth,
        })
      }
      oncreated()
      onclose()
    } catch (e) {
      error = e instanceof Error ? e.message : isEdit ? t('error.updateEntry') : t('error.createEntry')
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onclose()
  }

  function handleBackdrop(e: MouseEvent) {
    if (e.target === e.currentTarget) onclose()
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="backdrop" role="presentation" onclick={handleBackdrop}>
  <div class="modal" role="dialog" aria-label={isEdit ? t('entry.editTitle') : t('entry.addTitle')} use:focusTrap>
    <h3>{t(isEdit ? 'entry.editTypeTitle' : 'entry.addTypeTitle', { type: sideOf(selectedType) === 'income' ? t('category.typeIncome') : t('category.typeExpense') })}</h3>

    {#if typeChoices.length > 1}
      <label class="field">
        <span class="label">{t('entry.kind')}</span>
        <select bind:value={selectedType}>
          {#each typeChoices as choice}
            <option value={choice}>{t(`entryType.${choice}` as 'entryType.expense')}</option>
          {/each}
        </select>
      </label>
    {/if}

    <label class="field">
      <span class="label">{t('entry.category')}</span>
      {#if useNewCategory}
        <div class="category-input-row">
          <input
            type="text"
            bind:value={newCategoryName}
            placeholder={t('entry.newCategoryPlaceholder')}
          />
          <button class="link-btn" onclick={() => { useNewCategory = false; newCategoryName = '' }}>
            existing
          </button>
        </div>
      {:else}
        <div class="category-input-row">
          <select bind:value={selectedCategory}>
            {#each categories as g}
              <option value={g.name}>{g.name || t('budget.uncategorised')}</option>
            {/each}
          </select>
          <button class="link-btn" onclick={() => (useNewCategory = true)}>
            + new
          </button>
        </div>
      {/if}
    </label>

    <label class="field">
      <span class="label">{t('field.name')}</span>
      <input
        type="text"
        bind:value={name}
        placeholder={t('entry.namePlaceholder')}
        onkeydown={(e) => { if (e.key === 'Enter' && name.trim()) save() }}
      />
    </label>

    <div class="values-section">
        <span class="label">{t('entry.values')}</span>
        <div class="values-grid">
          <label class="value-field">
            <span class="value-label">{t('budget.plannedMo')}</span>
            <input
              type="text"
              inputmode="decimal"
              class="value-input"
              bind:value={plannedMoValue}
              onfocus={(e) => handleValueFocus('planned_mo', e)}
              onblur={() => handleValueBlur('planned_mo')}
              oninput={() => handleValueInput('planned_mo')}
              onkeydown={(e) => handleValueKeydown('planned_mo', e)}
            />
          </label>
          <label class="value-field">
            <span class="value-label">{t('budget.plannedYr')}</span>
            <input
              type="text"
              inputmode="decimal"
              class="value-input yearly"
              bind:value={plannedYrValue}
              onfocus={(e) => handleValueFocus('planned_yr', e)}
              onblur={() => handleValueBlur('planned_yr')}
              oninput={() => handleValueInput('planned_yr')}
              onkeydown={(e) => handleValueKeydown('planned_yr', e)}
            />
          </label>
        </div>
      </div>

    {#if error}
      <p class="error">{error}</p>
    {/if}

    <div class="actions">
      {#if isEdit && ondelete}
        <button class="btn delete" onclick={ondelete}>{t('action.delete')}</button>
      {/if}
      <span class="spacer"></span>
      <button class="btn cancel" onclick={onclose}>{t('action.cancel')}</button>
      <button class="btn save" onclick={save} disabled={!name.trim() || !resolvedCategoryName}>
        {isEdit ? t('action.save') : t('entry.add')}
      </button>
    </div>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    padding: 1rem;
  }
  .modal {
    background: white;
    border-radius: 12px;
    padding: 1.5rem;
    width: 100%;
    max-width: 400px;
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.2);
  }
  h3 {
    margin: 0 0 0.25rem;
    font-size: 1.1rem;
  }
  .category-input-row {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }
  .category-input-row select,
  .category-input-row input[type="text"] {
    flex: 1;
    padding: 0.6rem 0.75rem;
    border: 1px solid #ccc;
    border-radius: 6px;
    font-size: 1rem;
    outline: none;
  }
  .category-input-row select:focus,
  .category-input-row input[type="text"]:focus {
    border-color: #2d6a4f;
    box-shadow: 0 0 0 2px rgba(45, 106, 79, 0.2);
  }
  .link-btn {
    background: none;
    border: none;
    color: #2d6a4f;
    cursor: pointer;
    font-size: 0.85rem;
    white-space: nowrap;
    padding: 0.25rem;
  }
  .link-btn:hover:not(:disabled) {
    text-decoration: underline;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    margin-bottom: 1rem;
  }
  .label {
    font-size: 0.85rem;
    font-weight: 500;
    color: #333;
  }
  .field input[type="text"] {
    padding: 0.6rem 0.75rem;
    border: 1px solid #ccc;
    border-radius: 6px;
    font-size: 1rem;
    outline: none;
  }
  .field input[type="text"]:focus {
    border-color: #2d6a4f;
    box-shadow: 0 0 0 2px rgba(45, 106, 79, 0.2);
  }
  .error {
    color: #c0392b;
    font-size: 0.85rem;
    margin: 0 0 0.75rem;
    padding: 0.5rem;
    background: #fdecea;
    border-radius: 4px;
  }
  .actions {
    display: flex;
    gap: 0.75rem;
    align-items: center;
  }
  /* Delete sits apart from Cancel/Save rather than beside them: it is not one
     of the two ways to finish, and it should not be the button you hit while
     reaching for Cancel. */
  .spacer {
    flex: 1;
  }
  .delete {
    background: white;
    border: 1px solid #c0392b;
    color: #c0392b;
  }
  .delete:hover {
    background: #fdecea;
  }
  .btn {
    padding: 0.5rem 1.25rem;
    border-radius: 6px;
    font-size: 0.9rem;
    cursor: pointer;
  }
  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .cancel {
    background: #f1f3f5;
    border: 1px solid #dee2e6;
    color: #333;
  }
  .cancel:hover:not(:disabled) {
    background: #e9ecef;
  }
  .save {
    background: #2d6a4f;
    border: none;
    color: white;
  }
  .save:hover:not(:disabled) {
    background: #245a42;
  }

  .values-section {
    margin-bottom: 1rem;
  }
  .values-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem;
    margin-top: 0.25rem;
  }
  .value-field {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }
  .value-label {
    font-size: 0.75rem;
    color: #888;
  }
  .value-input {
    padding: 0.5rem;
    border: 1px solid #ccc;
    border-radius: 6px;
    font-size: 0.95rem;
    text-align: right;
    font-variant-numeric: tabular-nums;
    outline: none;
    width: 100%;
    box-sizing: border-box;
  }
  .value-input:focus {
    border-color: #2d6a4f;
    box-shadow: 0 0 0 2px rgba(45, 106, 79, 0.2);
  }
  .value-input.yearly {
    color: #888;
  }

  @media (max-width: 480px) {
    .backdrop {
      align-items: flex-end;
      padding: 0;
    }
    .modal {
      max-width: 100%;
      border-radius: 16px 16px 0 0;
      padding: 1.5rem 1.25rem 2rem;
    }
  }
</style>
