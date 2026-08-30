<script lang="ts">
  import { untrack } from 'svelte'
  import * as engine from '../../lib/budget/budgetEngine'
  import type { VaultData } from '../../lib/crypto/vault'
  import { focusTrap } from '../../lib/util/focusTrap'
  import { parseAmount } from '../../lib/util/money'

  interface Props {
    type: 'income' | 'expense'
    groups: { name: string; id: string }[]
    editCategory?: { id: string; name: string; groupName: string; plannedAmount?: string } | null
    /** Preselects the group when adding — set by the "+" on a group header. */
    presetGroupName?: string
    vault: VaultData
    oncreated: () => void
    onclose: () => void
    onsave?: (categoryId: string, amount: string) => void
    /**
     * Hands off to the delete confirmation. Only meaningful when editing, and
     * the reason the table row needs no delete control of its own on a narrow
     * screen — where there is no width for one.
     */
    ondelete?: () => void
  }

  let { type, groups, editCategory = null, presetGroupName, vault, oncreated, onclose, onsave, ondelete }: Props = $props()

  let isEdit = $derived(editCategory != null)
  // Seeded once: the modal is created fresh each time it opens, so every read of
  // `editCategory` below is deliberately an initial value rather than a reactive
  // one. `untrack` says so out loud, to Svelte and to the next reader.
  let name = $state(untrack(() => editCategory?.name ?? ''))
  let selectedGroup = $state(
    untrack(() => editCategory?.groupName ?? presetGroupName ?? groups[0]?.name ?? ''),
  )
  let newGroupName = $state('')
  let useNewGroup = $state(false)
  let error = $state<string | null>(null)

  let plannedMoValue = $state(
    untrack(() => (editCategory?.plannedAmount ? fmt(Number(editCategory.plannedAmount)) : '')),
  )
  let plannedYrValue = $state(
    untrack(() => (editCategory?.plannedAmount ? fmt(Number(editCategory.plannedAmount) * 12) : '')),
  )
  let valueFocusedField = $state<'planned_mo' | 'planned_yr' | null>(null)

  function fmt(val: number): string {
    return val.toLocaleString('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  function handleValueFocus(field: 'planned_mo' | 'planned_yr', event: FocusEvent) {
    valueFocusedField = field
    const input = event.target as HTMLInputElement
    requestAnimationFrame(() => input.select())
  }

  function handleValueBlur(field: 'planned_mo' | 'planned_yr') {
    valueFocusedField = null
    if (!editCategory || !onsave) return
    const raw = field === 'planned_mo' ? plannedMoValue : plannedYrValue
    const val = parseAmount(raw)
    if (isNaN(val) || !isFinite(val)) return

    if (field === 'planned_mo') {
      plannedMoValue = fmt(val)
      plannedYrValue = fmt(val * 12)
      onsave(editCategory.id, val.toFixed(2))
    } else {
      const monthly = val / 12
      plannedYrValue = fmt(val)
      plannedMoValue = fmt(monthly)
      onsave(editCategory.id, monthly.toFixed(4))
    }
  }

  function handleValueInput(field: 'planned_mo' | 'planned_yr') {
    const raw = field === 'planned_mo' ? plannedMoValue : plannedYrValue
    const val = parseAmount(raw)
    if (isNaN(val) || !isFinite(val)) return

    if (field === 'planned_mo') {
      plannedYrValue = fmt(val * 12)
    } else {
      plannedMoValue = fmt(val / 12)
    }
  }

  let resolvedGroupName = $derived(useNewGroup ? newGroupName.trim() : selectedGroup)

  function save() {
    const trimmed = name.trim()
    if (!trimmed) return
    if (!isEdit && !resolvedGroupName) return
    error = null

    try {
      if (isEdit && editCategory) {
        engine.updateCategory(vault, editCategory.id, {
          name: trimmed,
          groupName: resolvedGroupName,
        })
      } else {
        engine.createCategory(vault, {
          name: trimmed,
          type,
          groupName: resolvedGroupName,
        })
      }
      oncreated()
      onclose()
    } catch (e) {
      error = e instanceof Error ? e.message : isEdit ? 'Failed to update category' : 'Failed to create category'
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
  <div class="modal" role="dialog" aria-label={isEdit ? 'Edit category' : 'Add category'} use:focusTrap>
    <h3>{isEdit ? 'Edit' : 'Add'} {type === 'income' ? 'income' : 'expense'} category</h3>

    <label class="field">
      <span class="label">Group</span>
      {#if useNewGroup}
        <div class="group-input-row">
          <input
            type="text"
            bind:value={newGroupName}
            placeholder="New group name"
          />
          <button class="link-btn" onclick={() => { useNewGroup = false; newGroupName = '' }}>
            existing
          </button>
        </div>
      {:else}
        <div class="group-input-row">
          <select bind:value={selectedGroup}>
            {#each groups as g}
              <option value={g.name}>{g.name || 'Other'}</option>
            {/each}
          </select>
          <button class="link-btn" onclick={() => (useNewGroup = true)}>
            + new
          </button>
        </div>
      {/if}
    </label>

    <label class="field">
      <span class="label">Name</span>
      <input
        type="text"
        bind:value={name}
        placeholder="e.g. Gym membership"
        onkeydown={(e) => { if (e.key === 'Enter' && name.trim()) save() }}
      />
    </label>

    {#if isEdit && editCategory?.plannedAmount != null}
      <div class="values-section">
        <span class="label">Values</span>
        <div class="values-grid">
          <label class="value-field">
            <span class="value-label">Planned/mo</span>
            <input
              type="text"
              inputmode="decimal"
              class="value-input"
              bind:value={plannedMoValue}
              onfocus={(e) => handleValueFocus('planned_mo', e)}
              onblur={() => handleValueBlur('planned_mo')}
              oninput={() => handleValueInput('planned_mo')}
            />
          </label>
          <label class="value-field">
            <span class="value-label">Planned/yr</span>
            <input
              type="text"
              inputmode="decimal"
              class="value-input yearly"
              bind:value={plannedYrValue}
              onfocus={(e) => handleValueFocus('planned_yr', e)}
              onblur={() => handleValueBlur('planned_yr')}
              oninput={() => handleValueInput('planned_yr')}
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
        <button class="btn delete" onclick={ondelete}>Delete</button>
      {/if}
      <span class="spacer"></span>
      <button class="btn cancel" onclick={onclose}>Cancel</button>
      <button class="btn save" onclick={save} disabled={!name.trim() || !resolvedGroupName}>
        {isEdit ? 'Save' : 'Add'}
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
  .group-input-row {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }
  .group-input-row select,
  .group-input-row input[type="text"] {
    flex: 1;
    padding: 0.6rem 0.75rem;
    border: 1px solid #ccc;
    border-radius: 6px;
    font-size: 1rem;
    outline: none;
  }
  .group-input-row select:focus,
  .group-input-row input[type="text"]:focus {
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
