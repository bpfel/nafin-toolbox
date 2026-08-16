<script lang="ts">
  import { untrack } from 'svelte'
  import type { PlanEntryView } from '../../lib/budget/budgetEngine'
  import { isEditing } from '../../lib/util/editMode.svelte'

  type Field = 'planned_mo' | 'planned_yr'

  interface Props {
    entry: PlanEntryView
    viewMode?: 'monthly' | 'yearly'
    onsave: (categoryId: string, amount: string) => void
    ondelete: (categoryId: string, categoryName: string) => void
    onedit: (categoryId: string, categoryName: string, categoryType: 'income' | 'expense', groupName: string, plannedAmount: string) => void
  }

  let { entry, viewMode = 'monthly', onsave, ondelete, onedit }: Props = $props()

  // Reordering, renaming and deleting are structural; typing amounts is not. Only
  // the former wait for edit mode, so the everyday act of budgeting stays direct.
  let editing = $derived(isEditing('budget'))

  const MAX_MONTHLY = 9_999_999_999.99

  let plannedMoValue = $state('')
  let plannedYrValue = $state('')

  let plannedMoOriginal = ''
  let plannedYrOriginal = ''

  let plannedMoError = $state(false)
  let plannedYrError = $state(false)

  let focusedField = $state<Field | null>(null)

  let longPressTimer: ReturnType<typeof setTimeout> | null = null
  let longPressTriggered = false

  function handleTouchStart() {
    // The trash button is hidden on narrow screens, so long-press is the touch
    // equivalent of it — and gated the same way.
    if (!editing) return
    longPressTriggered = false
    longPressTimer = setTimeout(() => {
      longPressTriggered = true
      ondelete(entry.categoryId, entry.categoryName)
    }, 600)
  }

  function handleTouchEnd() {
    if (longPressTimer) {
      clearTimeout(longPressTimer)
      longPressTimer = null
    }
  }

  function handleTouchMove() {
    if (longPressTimer) {
      clearTimeout(longPressTimer)
      longPressTimer = null
    }
  }

  $effect(() => {
    const planned = Number(entry.plannedAmount)
    const focused = untrack(() => focusedField)

    if (focused !== 'planned_mo') {
      plannedMoValue = fmt(planned)
    }
    if (focused !== 'planned_yr') {
      plannedYrValue = fmt(planned * 12)
    }
  })

  function fmt(val: number): string {
    return val.toLocaleString('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  function handleFocus(field: Field, event: FocusEvent) {
    focusedField = field
    const input = event.target as HTMLInputElement
    if (field === 'planned_mo') plannedMoOriginal = plannedMoValue
    else plannedYrOriginal = plannedYrValue
    requestAnimationFrame(() => input.select())
  }

  function handleBlur(field: Field) {
    focusedField = null
    const current = getValue(field)
    const original = getOriginal(field)
    if (current !== original) {
      saveField(field)
    }
    setError(field, false)
  }

  function handleKeydown(field: Field, event: KeyboardEvent) {
    if (event.key === 'Enter') {
      event.preventDefault()
      if (saveField(field)) {
        const input = event.target as HTMLInputElement
        navigateVertical(input, field, event.shiftKey ? -1 : 1)
      }
    } else if (event.key === 'Escape') {
      event.preventDefault()
      revertField(field)
      ;(event.target as HTMLInputElement).blur()
    }
  }

  function navigateVertical(input: HTMLInputElement, field: Field, direction: 1 | -1) {
    const table = input.closest('table')
    if (!table) return
    const allInputs = Array.from(table.querySelectorAll<HTMLInputElement>(`input[data-field="${field}"]`))
    const currentIdx = allInputs.indexOf(input)
    const nextIdx = currentIdx + direction
    if (nextIdx >= 0 && nextIdx < allInputs.length) {
      allInputs[nextIdx].focus()
    } else {
      input.blur()
    }
  }

  function getValue(field: Field): string {
    return field === 'planned_mo' ? plannedMoValue : plannedYrValue
  }

  function getOriginal(field: Field): string {
    return field === 'planned_mo' ? plannedMoOriginal : plannedYrOriginal
  }

  function setError(field: Field, val: boolean) {
    if (field === 'planned_mo') plannedMoError = val
    else plannedYrError = val
  }

  function revertField(field: Field) {
    if (field === 'planned_mo') { plannedMoValue = plannedMoOriginal; plannedMoError = false }
    else { plannedYrValue = plannedYrOriginal; plannedYrError = false }
  }

  function parseInput(raw: string): number {
    const cleaned = raw.replace(/'/g, '').replace(/,/g, '.')
    return Number(cleaned)
  }

  function saveField(field: Field): boolean {
    const raw = getValue(field)
    const val = parseInput(raw)

    if (isNaN(val) || !isFinite(val)) {
      setError(field, true)
      return false
    }

    const monthly = field === 'planned_yr' ? val / 12 : val
    if (Math.abs(monthly) > MAX_MONTHLY) {
      setError(field, true)
      return false
    }

    setError(field, false)

    if (field === 'planned_mo') {
      onsave(entry.categoryId, val.toFixed(2))
    } else {
      onsave(entry.categoryId, (val / 12).toFixed(4))
    }

    return true
  }
</script>

<tr
  class="entry-row"
  class:income={entry.categoryType === 'income'}
  data-category-id={entry.categoryId}
  ontouchstart={handleTouchStart}
  ontouchend={handleTouchEnd}
  ontouchmove={handleTouchMove}
  ontouchcancel={handleTouchEnd}
>
  <td class="name-cell">
    <div class="name-cell-inner">
      {#if editing}
        <span class="drag-handle" aria-label="Drag to reorder">&#x2807;</span>
        <button
          class="name-text"
          onclick={() => onedit(entry.categoryId, entry.categoryName, entry.categoryType, entry.categoryGroupName, entry.plannedAmount)}
        >
          {entry.categoryName}
        </button>
        <button
          class="trash-btn"
          onclick={() => ondelete(entry.categoryId, entry.categoryName)}
          aria-label="Delete {entry.categoryName}"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
      {:else}
        <!-- Read-only: a button that opens nothing would only invite a click. -->
        <span class="name-text name-static">{entry.categoryName}</span>
      {/if}
    </div>
  </td>
  <td class="amount-cell planned-mo-cell">
    <input
      type="text"
      inputmode="decimal"
      class="cell-input"
      class:cell-error={plannedMoError}
      data-field="planned_mo"
      aria-label="Planned per month for {entry.categoryName}"
      bind:value={plannedMoValue}
      onfocus={(e) => handleFocus('planned_mo', e)}
      onblur={() => handleBlur('planned_mo')}
      onkeydown={(e) => handleKeydown('planned_mo', e)}
    />
  </td>
  <td class="amount-cell yearly planned-yr-cell">
    <input
      type="text"
      inputmode="decimal"
      class="cell-input"
      class:cell-error={plannedYrError}
      data-field="planned_yr"
      aria-label="Planned per year for {entry.categoryName}"
      bind:value={plannedYrValue}
      onfocus={(e) => handleFocus('planned_yr', e)}
      onblur={() => handleBlur('planned_yr')}
      onkeydown={(e) => handleKeydown('planned_yr', e)}
    />
  </td>
</tr>

<style>
  .entry-row td {
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid #eee;
  }
  .entry-row.income td {
    background: #f0fdf4;
  }
  .name-cell {
    overflow: hidden;
    white-space: nowrap;
  }
  .name-cell-inner {
    display: flex;
    align-items: center;
    gap: 0.35rem;
  }
  .drag-handle {
    cursor: grab;
    color: #ccc;
    font-size: 1rem;
    line-height: 1;
    user-select: none;
    flex-shrink: 0;
  }
  .drag-handle:hover {
    color: #888;
  }
  .name-text {
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1;
    min-width: 0;
    background: none;
    border: none;
    padding: 0;
    text-align: left;
    font-size: inherit;
    color: inherit;
    cursor: pointer;
    border-radius: 3px;
  }
  .name-text:hover {
    text-decoration: underline;
    text-decoration-color: #aaa;
    text-underline-offset: 2px;
  }
  /* Same box, none of the invitations to click it. */
  .name-static {
    cursor: default;
  }
  .name-static:hover {
    text-decoration: none;
  }
  .trash-btn {
    background: none;
    border: none;
    color: #ccc;
    cursor: pointer;
    padding: 0.15rem;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    opacity: 0;
    transition: opacity 0.15s;
  }
  .entry-row:hover .trash-btn {
    opacity: 1;
  }
  .trash-btn:hover {
    color: #c0392b;
  }
  @media (hover: none) and (min-width: 769px) {
    .trash-btn {
      opacity: 0.6;
    }
  }
  .amount-cell {
    text-align: right;
    font-variant-numeric: tabular-nums;
    overflow: hidden;
    white-space: nowrap;
    padding: 0.25rem 0.35rem;
  }
  .amount-cell.yearly .cell-input {
    color: #888;
  }
  .cell-input {
    width: 100%;
    max-width: 100%;
    box-sizing: border-box;
    padding: 0.25rem 0.5rem;
    border: 1px solid transparent;
    border-radius: 4px;
    text-align: right;
    font-size: inherit;
    font-family: inherit;
    font-variant-numeric: tabular-nums;
    background: transparent;
    color: inherit;
    outline: none;
    transition: border-color 0.15s, background-color 0.15s, box-shadow 0.15s;
  }
  .cell-input:hover {
    border-color: #ddd;
  }
  .cell-input:focus {
    border-color: #2d6a4f;
    background: white;
    box-shadow: 0 0 0 2px rgba(45, 106, 79, 0.15);
  }
  .cell-input.cell-error {
    border-color: #c0392b;
    background: #fdecea;
  }

  :global(.drag-ghost) {
    opacity: 0.5;
    background: #e3f2fd !important;
  }

  @media (max-width: 768px) {
    .entry-row td {
      padding: 0.4rem 0.5rem;
    }
    .cell-input {
      font-size: 16px;
      padding: 0.2rem 0.35rem;
    }
    .amount-cell {
      padding: 0.2rem 0.25rem;
    }
    .drag-handle {
      display: none;
    }
    .trash-btn {
      display: none;
    }
    .planned-yr-cell {
      display: none;
    }
    :global(.view-yearly .planned-mo-cell) {
      display: none;
    }
    :global(.view-yearly .planned-yr-cell) {
      display: table-cell;
    }
  }
</style>
