<script lang="ts">
  import { t } from '../../lib/i18n/index.svelte'
  import Sortable from 'sortablejs'
  import type { PlanEntryView } from '../../lib/budget/budgetEngine'
  import * as engine from '../../lib/budget/budgetEngine'
  import { sideOf, type EntryType, type VaultData } from '../../lib/crypto/vault'
  import { isEditing } from '../../lib/util/editMode.svelte'
  import Money from '../../lib/util/Money.svelte'
  import BudgetEntryRow from './BudgetEntryRow.svelte'
  import AddEntryRow from './AddEntryRow.svelte'
  import InfoButton from '../../lib/nav/InfoButton.svelte'
  import InfoModal from '../../lib/nav/InfoModal.svelte'
  import { TYPE_GUIDES } from '../../lib/budget/typeGuide'
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
    /**
     * Monthly or yearly, bound to the screen rather than owned here. The button
     * that flips it lives in this toolbar, but the summary above the table has
     * to follow it too — a control that changed only half of what is on screen
     * would read as broken.
     */
    viewMode?: 'monthly' | 'yearly'
  }

  let {
    entries,
    vault,
    onsave,
    onentrycreated,
    onentrydeleted,
    oncategorychanged,
    viewMode = $bindable('monthly'),
  }: Props = $props()

  // Structural affordances — dragging, adding, deleting — appear only in edit
  // mode. Reading the plan and typing amounts stay available always.
  let editing = $derived(isEditing('budget'))

  let addModalContext = $state<{ type: EntryType; categories: { name: string; id: string }[]; presetCategoryName?: string; editEntry?: { id: string; name: string; categoryName: string; plannedAmount: string } } | null>(null)
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

  let collapsedCategories = $state(new Set<string>())

  function toggleCategory(type: EntryType, categoryName: string) {
    const key = `${type}:${categoryName}`
    const next = new Set(collapsedCategories)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    collapsedCategories = next
  }

  function isCollapsed(type: EntryType, categoryName: string): boolean {
    return collapsedCategories.has(`${type}:${categoryName}`)
  }

  let incomeEntries = $derived(entries.filter(e => sideOf(e.entryType) === 'income'))
  let expenseEntries = $derived(entries.filter(e => sideOf(e.entryType) === 'expense'))

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

  /**
   * The five sections, in the order money moves through them: what arrives,
   * what is spent, and the three that hold on to it.
   *
   * A section per type rather than one per side. The side still decides which
   * categories a new entry may join — a Housing heading holds Rent and a roof
   * fund alike — but reading a budget means seeing what is being kept apart
   * from what is being spent, and until v7 those were the same column.
   */
  const SECTION_TYPES: EntryType[] = ['income', 'expense', 'savings', 'bill', 'purchase']

  /** Which section's explanation is open, if any. */
  let guideType = $state<EntryType | null>(null)

  let sections = $derived(
    SECTION_TYPES.map(type => ({
      type,
      categories: categoryEntries(entries.filter(e => e.entryType === type)),
    })),
  )

  // Categories are offered by *side*, not by type: a Housing heading holds Rent
  // and a roof fund alike, so a purchase entry picks from the same list an
  // expense does.
  function categoriesForType(type: EntryType): { name: string; id: string }[] {
    const categories = sideOf(type) === 'income' ? incomeCategories : expenseCategories
    return categories.map(g => ({ name: g.categoryName, id: g.categoryId }))
  }

  function openAddModal(type: EntryType, presetCategoryName?: string) {
    addModalContext = { type, categories: categoriesForType(type), presetCategoryName }
  }

  // The category header toggles collapse on click, so the "+" has to stop the event
  // reaching it — otherwise adding to a category also folds it away underneath you.
  function addToCategory(event: MouseEvent, type: EntryType, categoryName: string) {
    event.stopPropagation()
    openAddModal(type, categoryName)
  }

  function openEditModal(entryId: string, entryName: string, entryType: EntryType, categoryName: string, plannedAmount: string) {
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
</script>

{#snippet typeSection(type: EntryType, sectionCategories: EntryCategory[])}
  <!--
    The title sits on the page rather than inside the table, because it heads a
    region and not a column. As a `<th>` it read as one more row of table
    furniture, and with five sections it was five of them.

    The column labels are gone with it. "Planned /mo" and "Planned /yr" said the
    same two things above every section — ten labels for two facts, and both are
    plain from the figures underneath.
  -->
  <div class="section-head section-{type}">
    <h2 class="section-name">{t(`section.${type}` as 'section.expense')}</h2>
    <InfoButton
      label={t('guide.explain', { type: t(`section.${type}` as 'section.expense') })}
      onclick={() => (guideType = type)}
    />
  </div>

  <table use:categorySortable>
    <colgroup>
      <col class="col-name" />
      <col class="col-amount col-planned-mo" />
      <col class="col-amount col-planned-yr" />
    </colgroup>
    {#each sectionCategories as category (category.categoryId)}
      <tbody use:sortable data-category-id={category.categoryId}>
        {#if sectionCategories.length > 1 || editing}
          <tr class="category-header" class:editing class:collapsed={isCollapsed(type, category.categoryName)} onclick={() => toggleCategory(type, category.categoryName)}>
            <td>
              {#if editing}
                <span
                  class="category-drag-handle"
                  title={t('budget.dragToReorder')}
                  role="presentation"
                  onclick={(e) => e.stopPropagation()}
                >⠿</span>
              {/if}
              <span class="category-chevron">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                  {#if isCollapsed(type, category.categoryName)}
                    <path d="M4 2 L10 6 L4 10 Z" />
                  {:else}
                    <path d="M2 4 L6 10 L10 4 Z" />
                  {/if}
                </svg>
              </span>
              {#if editing}
                <button
                  class="category-name category-name-btn"
                  aria-label={t('budget.editCategoryOf', { category: category.categoryName || t('budget.uncategorised') })}
                  onclick={(e) => openCategoryEditor(e, category.categoryId)}
                >{category.categoryName || t('budget.uncategorised')}</button>
              {:else}
                <span class="category-name">{category.categoryName || t('budget.uncategorised')}</span>
              {/if}
              {#if editing}
                <button
                  class="category-add"
                  title={t('budget.addEntryTo', { category: category.categoryName || t('budget.uncategorised') })}
                  aria-label={t('budget.addEntryTo', { category: category.categoryName || t('budget.uncategorised') })}
                  onclick={(e) => addToCategory(e, type, category.categoryName)}
                >+</button>
              {/if}
            </td>
            <td class="right subtotal col-planned-mo"><Money value={category.plannedTotal} /></td>
            <td class="right subtotal yearly col-planned-yr"><Money value={category.plannedTotal * 12} /></td>
          </tr>
        {/if}
        {#if !isCollapsed(type, category.categoryName)}
          {#each category.entries as entry (entry.entryId)}
            <BudgetEntryRow {entry} {viewMode} onedit={openEditModal} />
          {/each}
        {/if}
      </tbody>
    {/each}
    <tfoot>
      {#if editing}
        <AddEntryRow onadd={() => openAddModal(type)} />
      {/if}
    </tfoot>
  </table>

{/snippet}

<div class="budget-table" class:view-yearly={viewMode === 'yearly'}>
  <!--
    One section per type, in the order money moves through them: what comes in,
    what is spent, and the three that keep it. A type with no entries and no
    edit mode shows nothing — five empty tables would be five headings to scroll
    past before reaching the one with anything in it.
  -->
  {#each sections as section (section.type)}
    {#if section.categories.length > 0 || editing}
      {@render typeSection(section.type, section.categories)}
    {/if}
  {/each}
</div>

{#if guideType}
  <InfoModal {...TYPE_GUIDES[guideType]} onclose={() => (guideType = null)} />
{/if}

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
  .section-name {
    vertical-align: middle;
  }
  /*
   * The mark is small; the target is not. The button keeps its full size and
   * carries no border of its own — what you see is the glyph inside it, at
   * about half the diameter, while the region that answers a thumb stays as
   * big as it ever was.
   *
   * `background: none` is repeated on :hover deliberately. app.css styles every
   * button green and darker green on hover, and `button:hover` outranks a plain
   * class for the background property — without this the mark filled with dark
   * green when pointed at.
   */
  /* Its own rule, not grouped with :hover — a :focus-visible block that sets
     only colours is how a focus ring goes missing, which is what the guard in
     HoverControls.test.ts is watching for. */


  .budget-table {
    display: flex;
    flex-direction: column;
    /* Nothing uniform: a title belongs to the box under it, so it sits closer
       to that than to the section it follows. The margins below say which. */
    gap: 0;
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
  /*
   * On the page's own background, above the card. Three levels, three devices:
   * the section is large and outside the box, the category is uppercase and
   * carries the total, the entries are plain and are what add up to it.
   */
  .section-head {
    display: flex;
    align-items: center;
    gap: 0.1rem;
    /* Above: the gap between one section and the next. Below: the gap between a
       title and the thing it titles, which is smaller so the two read as one
       block rather than as two loose rows. */
    margin: 1.25rem 0 0.35rem;
    padding: 0 0.25rem;
  }

  .section-head:first-of-type {
    margin-top: 0;
  }

  .section-name {
    font-size: 1.2rem;
    font-weight: 600;
    letter-spacing: -0.01em;
    color: var(--ink);
  }

  /* The one place the direction colour is worth spending: once per section,
     rather than on every figure in every row beneath it. */
  .section-income .section-name { color: var(--money-in); }
  .section-expense .section-name { color: var(--ink); }
  .section-savings .section-name,
  .section-bill .section-name,
  .section-purchase .section-name { color: var(--money-held); }
  :global(.category-header) {
    cursor: pointer;
    user-select: none;
  }
  :global(.category-header) td {
    /* Small caps and a shade larger than the entries beneath it, because it
       carries their total — a summary line, not a label. Small caps rather than
       uppercase: it keeps the word's own shape, which is what makes a proper
       noun still read as one. */
    padding: 0.85rem 0.75rem 0.35rem;
    background: none;
    /* The family is the small capitals — this cut's lower case is drawn as
       them — so no `font-variant-caps` here. Asking for one on top would have
       the browser synthesise from glyphs that are already small, shrinking
       them twice. Its upper case stays upper case, which is what keeps a
       leading capital on a proper noun. */
    font-family: var(--font-smallcaps);
    font-weight: 500;
    /* Small caps sit lower than capitals, so the same nominal size reads
       smaller. Up a little to keep it above the entries. */
    font-size: 1.15rem;
    /* Drawn small capitals need only a little air, not the extra that
       squeezed ones do. */
    letter-spacing: 0.02em;
    color: var(--ink);
    border-bottom: 1px solid var(--rule);
  }
  :global(.category-header.collapsed) td {
    border-bottom: 1px solid var(--rule);
  }
  :global(.category-header) .subtotal {
    /* The only bold figure in the section: a total, against entries that are
       not. Weight is what says "this one is the sum of those". */
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    text-align: right;
  }
  :global(.category-header) .yearly {
    color: var(--ink-faint);
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
    .section-name {
      font-size: 1.1rem;
    }
    /*
     * Only one amount column survives on a narrow screen — the view toggle
     * swaps which of the two it is — so the name takes the rest.
     *
     * The width has to be taken off the hidden column explicitly. `display:
     * none` hides a *cell*; a `<col>` ignores it and goes on reserving its
     * share, so with three columns declaring 60 + 40 + 40 the visible amount
     * stopped short of the right edge and the figures no longer lined up with
     * it. That was invisible while the widths lived on `<th>`s, which the same
     * rule really did hide.
     */
    .col-name {
      width: 60%;
    }
    .col-planned-mo {
      width: 40%;
    }
    .col-planned-yr {
      width: 0;
    }
    :global(.view-yearly) .col-planned-mo {
      width: 0;
    }
    :global(.view-yearly) .col-planned-yr {
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
