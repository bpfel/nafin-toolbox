<script lang="ts">
  import Sortable from 'sortablejs'
  import type { PlanEntryView } from '../../lib/budget/budgetEngine'
  import * as engine from '../../lib/budget/budgetEngine'
  import type { VaultData } from '../../lib/crypto/vault'
  import { isEditing } from '../../lib/util/editMode.svelte'
  import BudgetEntryRow from './BudgetEntryRow.svelte'
  import AddEntryRow from './AddEntryRow.svelte'
  import AddEntryModal from './AddEntryModal.svelte'
  import DeleteEntryModal from './DeleteEntryModal.svelte'
  import EditCategoryModal from './EditCategoryModal.svelte'

  interface EntryCategory {
    categoryName: string
    categoryId: string
    entries: PlanEntryView[]
    plannedTotal: number
  }

  interface Props {
    entries: PlanEntryView[]
    vault: VaultData
    onsave: (entryId: string, amount: string) => void
    onentrycreated: () => void
    onentrydeleted: () => void
    oncategorychanged: () => void
  }

  let { entries, vault, onsave, onentrycreated, onentrydeleted, oncategorychanged }: Props = $props()

  // Structural affordances — dragging, adding, deleting — appear only in edit
  // mode. Reading the plan and typing amounts stay available always.
  let editing = $derived(isEditing('budget'))

  let addModalContext = $state<{ type: 'income' | 'expense'; categories: { name: string; id: string }[]; presetCategoryName?: string; editEntry?: { id: string; name: string; categoryName: string; plannedAmount: string } } | null>(null)
  let deleteModalContext = $state<{ entryId: string; entryName: string } | null>(null)
  let editCategoryId = $state<string | null>(null)

  let editCategory = $derived(
    editCategoryId ? vault.budget.categories.find(g => g.id === editCategoryId) ?? null : null,
  )

  // The header row toggles collapse on click, so the name has to stop the event
  // reaching it — same reason the "+" and the drag handle do.
  function openCategoryEditor(event: MouseEvent, categoryId: string) {
    event.stopPropagation()
    editCategoryId = categoryId
  }

  let viewMode = $state<'monthly' | 'yearly'>('monthly')
  let collapsedCategories = $state(new Set<string>())

  function toggleCategory(type: 'income' | 'expense', categoryName: string) {
    const key = `${type}:${categoryName}`
    const next = new Set(collapsedCategories)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    collapsedCategories = next
  }

  function isCollapsed(type: 'income' | 'expense', categoryName: string): boolean {
    return collapsedCategories.has(`${type}:${categoryName}`)
  }

  let incomeEntries = $derived(entries.filter(e => e.entryType === 'income'))
  let expenseEntries = $derived(entries.filter(e => e.entryType === 'expense'))

  function categoryEntries(list: PlanEntryView[]): EntryCategory[] {
    const map = new Map<string, EntryCategory>()
    for (const e of list) {
      const key = e.categoryName || ''
      if (!map.has(key)) {
        map.set(key, {
          categoryName: key,
          categoryId: e.categoryId,
          entries: [],
          plannedTotal: 0,
        })
      }
      const g = map.get(key)!
      g.entries.push(e)
      g.plannedTotal += Number(e.plannedAmount)
    }
    // Order by the category's own sortOrder. This used to be inferred from wherever
    // each category's first entry landed in the entry sort, which meant
    // dragging an entry could silently reshuffle whole categories.
    return Array.from(map.values()).sort((a, b) => categoryOrder(a.categoryId) - categoryOrder(b.categoryId))
  }

  function categoryOrder(categoryId: string): number {
    return vault.budget.categories.find(g => g.id === categoryId)?.sortOrder ?? Number.MAX_SAFE_INTEGER
  }

  let incomeCategories = $derived(categoryEntries(incomeEntries))
  let expenseCategories = $derived(categoryEntries(expenseEntries))

  function categoriesForType(type: 'income' | 'expense'): { name: string; id: string }[] {
    const categories = type === 'income' ? incomeCategories : expenseCategories
    return categories.map(g => ({ name: g.categoryName, id: g.categoryId }))
  }

  function openAddModal(type: 'income' | 'expense', presetCategoryName?: string) {
    addModalContext = { type, categories: categoriesForType(type), presetCategoryName }
  }

  // The category header toggles collapse on click, so the "+" has to stop the event
  // reaching it — otherwise adding to a category also folds it away underneath you.
  function addToCategory(event: MouseEvent, type: 'income' | 'expense', categoryName: string) {
    event.stopPropagation()
    openAddModal(type, categoryName)
  }

  function openEditModal(entryId: string, entryName: string, entryType: 'income' | 'expense', categoryName: string, plannedAmount: string) {
    addModalContext = { type: entryType, categories: categoriesForType(entryType), editEntry: { id: entryId, name: entryName, categoryName, plannedAmount } }
  }

  function openDeleteModal(entryId: string, entryName: string) {
    deleteModalContext = { entryId, entryName }
  }

  // Delete from inside the edit dialog: close it and hand over to the same
  // confirmation the row's trash button opens, so there is one place an entry
  // is actually deleted rather than two.
  function deleteFromEditor() {
    const editing = addModalContext?.editEntry
    if (!editing) return
    addModalContext = null
    openDeleteModal(editing.id, editing.name)
  }

  function handleEntryCreated() {
    onentrycreated()
  }

  function handleEntryDeleted(entryId: string) {
    engine.deleteEntry(vault, entryId)
    onentrydeleted()
  }

  // Hiding a handle removes the affordance but leaves the Sortable instance live,
  // so a drag started by other means (a touch on the row, a stray handle left in
  // the DOM) would still reorder a read-only plan. Every instance is registered
  // here and its `disabled` option follows edit mode.
  const sortables = new Set<Sortable>()

  function register(instance: Sortable) {
    instance.option('disabled', !isEditing('budget'))
    sortables.add(instance)
    return {
      destroy() {
        sortables.delete(instance)
        instance.destroy()
      },
    }
  }

  $effect(() => {
    const disabled = !editing
    for (const instance of sortables) {
      instance.option('disabled', disabled)
    }
  })

  function sortable(node: HTMLElement) {
    const instance = Sortable.create(node, {
      animation: 150,
      handle: '.drag-handle',
      draggable: '.entry-row',
      filter: '.category-header, .add-row',
      ghostClass: 'drag-ghost',
      onEnd() {
        const rows = node.querySelectorAll('.entry-row')
        const ids = Array.from(rows).map(r => (r as HTMLElement).dataset.entryId!).filter(Boolean)
        if (ids.length > 0) {
          engine.reorderEntries(vault, ids)
          onentrycreated()
        }
      },
    })
    return register(instance)
  }

  // Categories are <tbody> elements, so the sortable lives on the <table> and drags
  // whole tbodies. Separate from the per-category `sortable` above, which drags rows
  // within one category.
  function categorySortable(node: HTMLElement) {
    const instance = Sortable.create(node, {
      animation: 150,
      handle: '.category-drag-handle',
      draggable: 'tbody',
      ghostClass: 'drag-ghost',
      onEnd() {
        const ids = Array.from(node.querySelectorAll('tbody'))
          .map(b => (b as HTMLElement).dataset.categoryId)
          .filter((id): id is string => Boolean(id))
        if (ids.length > 0) {
          engine.reorderCategories(vault, ids)
          onentrycreated()
        }
      },
    })
    return register(instance)
  }

  function fmt(val: number): string {
    return val.toLocaleString('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }
</script>

<div class="budget-table" class:view-yearly={viewMode === 'yearly'}>
  <div class="table-toolbar">
    <button
      class="view-toggle"
      aria-label="Showing {viewMode} amounts — switch to {viewMode === 'monthly' ? 'yearly' : 'monthly'}"
      onclick={() => viewMode = viewMode === 'monthly' ? 'yearly' : 'monthly'}
    >
      {viewMode === 'monthly' ? 'Month' : 'Year'}
    </button>
  </div>

  <table use:categorySortable>
    <thead>
      <tr>
        <th class="col-name">Income</th>
        <th class="right col-amount col-planned-mo">Planned/mo</th>
        <th class="right col-amount col-planned-yr">Planned/yr</th>
      </tr>
    </thead>
    {#each incomeCategories as category (category.categoryId)}
      <tbody use:sortable data-category-id={category.categoryId}>
        {#if incomeCategories.length > 1 || editing}
          <tr class="category-header" class:editing class:collapsed={isCollapsed('income', category.categoryName)} onclick={() => toggleCategory('income', category.categoryName)}>
            <td>
              {#if editing}
                <span
                  class="category-drag-handle"
                  title="Drag to reorder"
                  role="presentation"
                  onclick={(e) => e.stopPropagation()}
                >⠿</span>
              {/if}
              <span class="category-chevron">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                  {#if isCollapsed('income', category.categoryName)}
                    <path d="M4 2 L10 6 L4 10 Z" />
                  {:else}
                    <path d="M2 4 L6 10 L10 4 Z" />
                  {/if}
                </svg>
              </span>
              {#if editing}
                <button
                  class="category-name category-name-btn"
                  aria-label="Edit category {category.categoryName || 'Other'}"
                  onclick={(e) => openCategoryEditor(e, category.categoryId)}
                >{category.categoryName || 'Other'}</button>
              {:else}
                <span class="category-name">{category.categoryName || 'Other'}</span>
              {/if}
              {#if editing}
                <button
                  class="category-add"
                  title="Add an entry to {category.categoryName || 'Other'}"
                  aria-label="Add an entry to {category.categoryName || 'Other'}"
                  onclick={(e) => addToCategory(e, 'income', category.categoryName)}
                >+</button>
              {/if}
            </td>
            <td class="right subtotal col-planned-mo">{fmt(category.plannedTotal)}</td>
            <td class="right subtotal yearly col-planned-yr">{fmt(category.plannedTotal * 12)}</td>
          </tr>
        {/if}
        {#if !isCollapsed('income', category.categoryName)}
          {#each category.entries as entry (entry.entryId)}
            <BudgetEntryRow {entry} {viewMode} onedit={openEditModal} />
          {/each}
        {/if}
      </tbody>
    {/each}
    <tfoot>
      {#if editing}
        <AddEntryRow onadd={() => openAddModal('income')} />
      {/if}
    </tfoot>
  </table>

  <table use:categorySortable>
    <thead>
      <tr>
        <th class="col-name">Expenses</th>
        <th class="right col-amount col-planned-mo">Planned/mo</th>
        <th class="right col-amount col-planned-yr">Planned/yr</th>
      </tr>
    </thead>
    {#each expenseCategories as category (category.categoryId)}
      <tbody use:sortable data-category-id={category.categoryId}>
        {#if expenseCategories.length > 1 || editing}
          <tr class="category-header" class:editing class:collapsed={isCollapsed('expense', category.categoryName)} onclick={() => toggleCategory('expense', category.categoryName)}>
            <td>
              {#if editing}
                <span
                  class="category-drag-handle"
                  title="Drag to reorder"
                  role="presentation"
                  onclick={(e) => e.stopPropagation()}
                >⠿</span>
              {/if}
              <span class="category-chevron">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                  {#if isCollapsed('expense', category.categoryName)}
                    <path d="M4 2 L10 6 L4 10 Z" />
                  {:else}
                    <path d="M2 4 L6 10 L10 4 Z" />
                  {/if}
                </svg>
              </span>
              {#if editing}
                <button
                  class="category-name category-name-btn"
                  aria-label="Edit category {category.categoryName || 'Other'}"
                  onclick={(e) => openCategoryEditor(e, category.categoryId)}
                >{category.categoryName || 'Other'}</button>
              {:else}
                <span class="category-name">{category.categoryName || 'Other'}</span>
              {/if}
              {#if editing}
                <button
                  class="category-add"
                  title="Add an entry to {category.categoryName || 'Other'}"
                  aria-label="Add an entry to {category.categoryName || 'Other'}"
                  onclick={(e) => addToCategory(e, 'expense', category.categoryName)}
                >+</button>
              {/if}
            </td>
            <td class="right subtotal col-planned-mo">{fmt(category.plannedTotal)}</td>
            <td class="right subtotal yearly col-planned-yr">{fmt(category.plannedTotal * 12)}</td>
          </tr>
        {/if}
        {#if !isCollapsed('expense', category.categoryName)}
          {#each category.entries as entry (entry.entryId)}
            <BudgetEntryRow {entry} {viewMode} onedit={openEditModal} />
          {/each}
        {/if}
      </tbody>
    {/each}
    <tfoot>
      {#if editing}
        <AddEntryRow onadd={() => openAddModal('expense')} />
      {/if}
    </tfoot>
  </table>
</div>

{#if addModalContext}
  <AddEntryModal
    type={addModalContext.type}
    categories={addModalContext.categories}
    editEntry={addModalContext.editEntry}
    presetCategoryName={addModalContext.presetCategoryName}
    {vault}
    oncreated={handleEntryCreated}
    onclose={() => addModalContext = null}
    {onsave}
    ondelete={deleteFromEditor}
  />
{/if}

{#if deleteModalContext}
  <DeleteEntryModal
    entryId={deleteModalContext.entryId}
    entryName={deleteModalContext.entryName}
    ondeleted={() => handleEntryDeleted(deleteModalContext!.entryId)}
    onclose={() => deleteModalContext = null}
  />
{/if}

{#if editCategory}
  <EditCategoryModal
    category={editCategory}
    {vault}
    onsaved={oncategorychanged}
    onclose={() => editCategoryId = null}
  />
{/if}

<style>
  .budget-table {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }
  table {
    width: 100%;
    table-layout: fixed;
    border-collapse: collapse;
    background: white;
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }
  .col-name {
    width: 60%;
  }
  .col-amount {
    width: 20%;
  }
  th {
    text-align: left;
    padding: 0.75rem;
    background: #f8f9fa;
    border-bottom: 2px solid #dee2e6;
    font-size: 0.85rem;
    color: #666;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  th.right {
    text-align: right;
  }
  :global(.category-header) {
    cursor: pointer;
    user-select: none;
  }
  :global(.category-header) td {
    padding: 0.5rem 0.75rem;
    background: #f1f3f5;
    font-weight: 600;
    font-size: 0.85rem;
    color: #495057;
    border-bottom: 1px solid #dee2e6;
  }
  :global(.category-header.collapsed) td {
    border-bottom: 2px solid #ced4da;
  }
  :global(.category-header) .subtotal {
    font-variant-numeric: tabular-nums;
    text-align: right;
  }
  :global(.category-header) .yearly {
    color: #888;
  }
  /* These two exist only inside edit mode — outside it they are not rendered at
     all, so the header still reads as a label. That makes a hover-reveal pure
     cost: on a touchscreen there is no hover, so the controls edit mode just
     unlocked were invisible. Visible whenever they exist; hover only shifts
     the colour. */
  .category-drag-handle {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: grab;
    color: #adb5bd;
    margin-right: 0.3rem;
    transition: color 0.12s;
    user-select: none;
  }
  .category-drag-handle:hover {
    color: #495057;
  }
  .category-drag-handle:active {
    cursor: grabbing;
  }
  .category-add {
    background: none;
    border: none;
    color: #868e96;
    cursor: pointer;
    font-size: 1rem;
    line-height: 1;
    padding: 0 0.35rem;
    margin-left: 0.2rem;
    transition: color 0.12s;
  }
  .category-add:hover {
    color: #2d6a4f;
  }
  .category-add:focus-visible {
    outline: 2px solid #2d6a4f;
    outline-offset: 2px;
    border-radius: 4px;
    color: #2d6a4f;
  }
  /* Marked like the entry name, because it opens the same kind of dialog. */
  .category-name-btn {
    background: none;
    border: none;
    padding: 0;
    font: inherit;
    color: inherit;
    cursor: pointer;
    border-radius: 3px;
  }
  .category-name-btn:hover {
    text-decoration: underline;
    text-decoration-color: #aaa;
    text-underline-offset: 2px;
  }
  /* table-layout is fixed, so the name column cannot borrow slack from the
     amount columns. Without this a name like "Abgaben und Versicherungen"
     wraps and doubles the row height. Entry names already behave this way. */
  .category-name {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }
  :global(.category-header) td:first-child {
    display: flex;
    align-items: center;
    gap: 0.1rem;
  }
  .category-chevron {
    display: inline-flex;
    align-items: center;
    margin-right: 0.35rem;
    opacity: 0;
    transition: opacity 0.15s;
    vertical-align: middle;
    color: #868e96;
  }
  /* The chevron is not an edit-mode control — it collapses the category in either
     mode — so outside edit mode it keeps the hover-reveal and relies on the
     coarse-pointer rule below. Inside edit mode it sits between two now-permanent
     controls, and a gap that fills in on hover would only look like a glitch. */
  :global(.category-header:hover) .category-chevron,
  :global(.category-header.editing) .category-chevron,
  :global(.category-header.collapsed) .category-chevron {
    opacity: 1;
  }

  .table-toolbar {
    display: none;
  }

  .view-toggle {
    padding: 0.2rem 0.6rem;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    background: #e9ecef;
    color: #495057;
    border: 1px solid #dee2e6;
    border-radius: 4px;
    cursor: pointer;
    min-height: auto;
    min-width: auto;
  }
  .view-toggle:hover {
    background: #dee2e6;
  }

  @media (hover: none) and (pointer: coarse) {
    .category-chevron {
      opacity: 1;
    }
    /* Both glyphs are about 14px across — visible, but a fingertip needs more
       than that. Widen the hit area, not the glyph. Keyed on the pointer rather
       than the viewport: a wide touchscreen has the same fingers. */
    .category-drag-handle,
    .category-add {
      min-width: 32px;
      min-height: 32px;
      margin: 0;
      padding: 0;
    }
  }

  @media (max-width: 768px) {
    /* Sticks once scrolled past, so switching month/year does not mean
       scrolling back to the top of a long budget. `top: 0` is relative to the
       nearest scroll container, which here is the page. */
    .table-toolbar {
      display: flex;
      justify-content: flex-end;
      margin-bottom: 0.5rem;
      position: sticky;
      top: 0;
      z-index: 3;
      /* The toolbar is transparent, so without a backdrop the table scrolls
         visibly underneath the button. */
      background: linear-gradient(to bottom, #f8f9fa 70%, rgba(248, 249, 250, 0));
      padding: 0.4rem 0 0.6rem;
    }
    .view-toggle {
      min-height: 34px;
      padding: 0.3rem 0.9rem;
      font-size: 0.8rem;
    }
    th {
      padding: 0.5rem;
      font-size: 0.8rem;
    }
    /* Only one amount column survives on a narrow screen — the view toggle
       swaps which of the two it is — so the name takes the rest. */
    .col-name {
      width: 60%;
    }
    .col-amount {
      width: 40%;
    }
    .col-planned-yr {
      display: none;
    }
    :global(.col-planned-yr) {
      display: none;
    }
    :global(.view-yearly .col-planned-mo) {
      display: none;
    }
    :global(.view-yearly .col-planned-yr) {
      display: table-cell;
    }
    :global(.category-header) td {
      padding: 0.4rem 0.5rem;
    }
  }
</style>
