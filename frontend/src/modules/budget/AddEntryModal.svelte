<script lang="ts">
  import { t } from '../../lib/i18n/index.svelte'
  import { untrack } from 'svelte'
  import * as engine from '../../lib/budget/budgetEngine'
  import {
    savesTowardsTarget,
    type EntryType,
    type VaultData,
  } from '../../lib/crypto/vault'
  import { focusTrap } from '../../lib/util/focusTrap'
  import { closeOnBack } from '../../lib/nav/closeOnBack'
  import { autofocus } from '../../lib/util/autofocus'
  import { formatAmount, parseAmount } from '../../lib/util/money'
  import { monthNames } from '../../lib/util/months'

  /**
   * Adding or editing one budget line.
   *
   * There is no "what kind is this?" question: the type comes from the button
   * that opened the dialog, the way income and expense always did. Each type
   * asks for what it needs and nothing else, which is the whole reason the type
   * exists — a bill knows it recurs, a purchase knows it wears out, and neither
   * has to be assembled from a generic entry plus a second screen.
   *
   * The type cannot be changed here. Turning a bill into a purchase is a
   * different line with a different meaning; delete and add.
   */
  interface Props {
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
  /** Bill and purchase save towards a figure; the other three do not. */
  let targeted = $derived(savesTowardsTarget(type))

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

  const now = new Date()
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  /**
   * How often a bill comes round, in months.
   *
   * Divisors of twelve, and not one: a bill that arrives every month is just an
   * expense, with nothing to save up for. Every real Swiss billing cycle is on
   * this list — quarterly insurance, half-yearly tax instalments, an annual
   * subscription — and constraining it to divisors is what lets the due date be
   * a month with no year attached: shifting the anchor by a whole year cannot
   * change a series whose period divides twelve.
   */
  const BILL_PERIODS = [2, 3, 4, 6, 12]
  const DEFAULT_BILL_PERIOD = 12
  const DEFAULT_PURCHASE_YEARS = 2

  /** The reserve as stored: the plan view does not carry one. */
  function storedReserve() {
    return editEntry ? vault.budget.entries.find(e => e.id === editEntry.id)?.reserve : undefined
  }

  let totalValue = $state(
    untrack(() => {
      const reserve = storedReserve()
      return reserve ? formatAmount(reserve.targetAmount) : ''
    }),
  )

  let periodMonths = $state(
    untrack(() => {
      const reserve = storedReserve()
      if (reserve) return reserve.periodMonths
      return type === 'bill' ? DEFAULT_BILL_PERIOD : DEFAULT_PURCHASE_YEARS * 12
    }),
  )

  let anchorMonthNumber = $state(
    untrack(() => {
      const reserve = storedReserve()
      return (reserve?.anchorMonth ?? currentMonth).slice(5, 7)
    }),
  )

  let anchorYear = $state(
    untrack(() => {
      const reserve = storedReserve()
      return (reserve?.anchorMonth ?? currentMonth).slice(0, 4)
    }),
  )

  let periodYears = $derived(Math.floor(periodMonths / 12))
  let periodRemainderMonths = $derived(periodMonths % 12)

  let plannedMoValue = $state(
    untrack(() => (editEntry?.plannedAmount ? formatAmount(Number(editEntry.plannedAmount)) : '')),
  )
  let plannedYrValue = $state(
    untrack(() => (editEntry?.plannedAmount ? formatAmount(Number(editEntry.plannedAmount) * 12) : '')),
  )
  let valueFocusedField = $state<'planned_mo' | 'planned_yr' | null>(null)

  // --- the three-way relation --------------------------------------------
  //
  // total = monthly x period. State two of them and the third follows, which is
  // what makes a bill or a purchase describable in the terms people actually
  // hold them in: "2000 francs, and it lasts seven years" or "fifteen a month,
  // and let us see when that gets me there".
  //
  // For a bill only the first form is offered — the period is a fixed set of
  // billing cycles, so deriving it from an amount would produce cycles that do
  // not exist.

  function centsOf(value: string): number {
    const parsed = parseAmount(value)
    return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0
  }

  function monthlyFromTotal(): string {
    const total = centsOf(totalValue)
    if (total <= 0 || periodMonths <= 0) return ''
    return formatAmount(Math.round(total / periodMonths) / 100)
  }

  let derivedMonthly = $derived(targeted ? monthlyFromTotal() : '')

  function changeTotal(raw: string) {
    totalValue = raw
  }

  function changeBillPeriod(raw: string) {
    const months = Number(raw)
    if (BILL_PERIODS.includes(months)) periodMonths = months
  }

  function changePurchasePeriod(years: string, months: string) {
    const total = Math.max(1, Number(years || 0) * 12 + Number(months || 0))
    if (Number.isFinite(total)) periodMonths = total
  }

  /**
   * The other direction: say what you are willing to put aside and find out how
   * long it takes. Rounded up, because arriving a month early is not a problem
   * and arriving a month short is.
   */
  function changePurchaseMonthly(raw: string) {
    const monthly = centsOf(raw)
    const total = centsOf(totalValue)
    if (monthly <= 0 || total <= 0) return
    periodMonths = Math.max(1, Math.ceil(total / monthly))
  }

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

  /** The monthly figure as it will be stored, or '' when there is none. */
  function monthlyAmount(): string {
    if (targeted) {
      const total = centsOf(totalValue)
      if (total <= 0 || periodMonths <= 0) return ''
      return (Math.round(total / periodMonths) / 100).toFixed(2)
    }
    const value = parseAmount(plannedMoValue)
    if (plannedMoValue.trim() === '' || isNaN(value) || !isFinite(value)) return ''
    return value.toFixed(2)
  }

  let anchorMonth = $derived(
    type === 'bill'
      // The year is noise for a bill: the period divides twelve, so the series
      // is the same whichever year the anchor names.
      ? `${currentMonth.slice(0, 4)}-${anchorMonthNumber}`
      : `${anchorYear.padStart(4, '0')}-${anchorMonthNumber}`,
  )

  let resolvedCategoryName = $derived(useNewCategory ? newCategoryName.trim() : selectedCategory)

  let canSave = $derived(
    name.trim() !== '' &&
      resolvedCategoryName !== '' &&
      (!targeted || centsOf(totalValue) > 0),
  )

  function save() {
    const trimmed = name.trim()
    if (!canSave) return
    error = null

    try {
      if (isEdit && editEntry) {
        engine.updateEntry(vault, editEntry.id, {
          name: trimmed,
          categoryName: resolvedCategoryName,
        })
        if (targeted) {
          engine.setReserve(vault, editEntry.id, {
            targetAmount: (centsOf(totalValue) / 100).toFixed(2),
            periodMonths,
            anchorMonth,
          })
          onsave?.(editEntry.id, monthlyAmount())
        }
      } else {
        engine.createEntry(vault, {
          name: trimmed,
          type,
          categoryName: resolvedCategoryName,
          plannedAmount: monthlyAmount(),
          anchorMonth,
          targetAmount: targeted ? (centsOf(totalValue) / 100).toFixed(2) : undefined,
          periodMonths: targeted ? periodMonths : undefined,
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
  <div class="modal" role="dialog" aria-label={isEdit ? t('entry.editTitle') : t('entry.addTitle')} use:focusTrap use:closeOnBack={onclose}>
    <h3>
      {t(isEdit ? 'entry.editTypeTitle' : 'entry.addTypeTitle', {
        type: t(`entryType.${type}` as 'entryType.expense'),
      })}
    </h3>

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
            {t('entry.useExistingCategory')}
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
            {t('entry.newCategory')}
          </button>
        </div>
      {/if}
    </label>

    <label class="field">
      <span class="label">{t('field.name')}</span>
      <!-- Not the first control in the dialog — the category select above is,
           and it already holds a sensible value. This is the empty one. -->
      <input
        use:autofocus
        type="text"
        bind:value={name}
        placeholder={t('entry.namePlaceholder')}
        onkeydown={(e) => { if (e.key === 'Enter' && name.trim()) save() }}
      />
    </label>

    {#if targeted}
      <label class="field">
        <span class="label">
          {type === 'bill' ? t('reserve.billAmount') : t('reserve.price')}
        </span>
        <input
          type="text"
          inputmode="decimal"
          value={totalValue}
          oninput={(e) => changeTotal(e.currentTarget.value)}
        />
      </label>

      {#if type === 'bill'}
        <label class="field">
          <span class="label">{t('reserve.arrivesEvery')}</span>
          <select value={String(periodMonths)} onchange={(e) => changeBillPeriod(e.currentTarget.value)}>
            {#each BILL_PERIODS as months}
              <option value={String(months)}>{t('reserve.everyMonths', { months: String(months) })}</option>
            {/each}
          </select>
        </label>

        <label class="field">
          <span class="label">{t('reserve.dueMonth')}</span>
          <select bind:value={anchorMonthNumber}>
            {#each monthNames() as monthName, i}
              <option value={String(i + 1).padStart(2, '0')}>{monthName}</option>
            {/each}
          </select>
        </label>
      {:else}
        <div class="field">
          <span class="label">{t('reserve.lasts')}</span>
          <div class="split">
            <label class="split-field">
              <input
                type="text"
                inputmode="numeric"
                value={String(periodYears)}
                oninput={(e) => changePurchasePeriod(e.currentTarget.value, String(periodRemainderMonths))}
              />
              <span class="split-label">{t('time.years')}</span>
            </label>
            <label class="split-field">
              <input
                type="text"
                inputmode="numeric"
                value={String(periodRemainderMonths)}
                oninput={(e) => changePurchasePeriod(String(periodYears), e.currentTarget.value)}
              />
              <span class="split-label">{t('time.monthsShort')}</span>
            </label>
          </div>
        </div>

        <div class="field">
          <span class="label">{t('reserve.acquired')}</span>
          <div class="split">
            <label class="split-field wide">
              <select bind:value={anchorMonthNumber}>
                {#each monthNames() as monthName, i}
                  <option value={String(i + 1).padStart(2, '0')}>{monthName}</option>
                {/each}
              </select>
            </label>
            <label class="split-field">
              <input type="text" inputmode="numeric" maxlength="4" bind:value={anchorYear} />
            </label>
          </div>
        </div>
      {/if}

      <label class="field">
        <span class="label">{t('reserve.setAsideMonthly')}</span>
        {#if type === 'bill'}
          <!-- Derived, and only derived: the cycle is fixed, so the amount that
               keeps up with it is arithmetic rather than a preference. -->
          <input type="text" value={derivedMonthly} readonly />
        {:else}
          <!-- Editable, and it moves the period rather than fighting it: say
               what you can put aside and find out when that gets you there. -->
          <input
            type="text"
            inputmode="decimal"
            value={derivedMonthly}
            onchange={(e) => changePurchaseMonthly(e.currentTarget.value)}
          />
        {/if}
      </label>
    {:else}
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
    {/if}

    {#if error}
      <p class="error">{error}</p>
    {/if}

    <div class="actions">
      {#if isEdit && ondelete}
        <button class="btn delete" onclick={ondelete}>{t('action.delete')}</button>
      {/if}
      <span class="spacer"></span>
      <button class="btn cancel" onclick={onclose}>{t('action.cancel')}</button>
      <button class="btn save" onclick={save} disabled={!canSave}>
        {isEdit ? t('action.save') : t('entry.add')}
      </button>
    </div>
  </div>
</div>

<style>
  .split {
    display: flex;
    gap: 0.5rem;
  }
  .split-field {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    flex: 1;
    min-width: 0;
  }
  .split-field.wide {
    flex: 2;
  }
  .split-field input,
  .split-field select {
    min-width: 0;
    flex: 1;
  }
  .split-label {
    font-size: 0.8rem;
    color: #666;
    white-space: nowrap;
  }
  input[readonly] {
    background: #f5f5f7;
    color: #555;
  }

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
    /* A dialog taller than the screen is a dialog whose buttons cannot be
       reached. `dvh` rather than `vh`: on a phone the two disagree by exactly
       the height of the browser's own chrome, which is the margin that decides
       whether the last row is on screen. */
    max-height: 88dvh;
    overflow-y: auto;
    box-shadow: var(--shadow-modal);
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
    color: var(--ink-faint);
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
    color: var(--ink-faint);
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
