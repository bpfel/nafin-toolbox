<script lang="ts">
  import Sortable from 'sortablejs'
  import type { BudgetEntry } from '../../lib/api/client'
  import { reorderBudgetCategories } from '../../lib/api/client'
  import BudgetEntryRow from './BudgetEntryRow.svelte'
  import AddCategoryRow from './AddCategoryRow.svelte'
  import AddCategoryModal from './AddCategoryModal.svelte'
  import DeleteCategoryModal from './DeleteCategoryModal.svelte'

  interface EntryGroup {
    groupName: string
    groupSortOrder: number
    entries: BudgetEntry[]
    plannedTotal: number
    actualTotal: number
  }

  interface Props {
    entries: BudgetEntry[]
    onsave: (categoryId: number, field: 'planned' | 'actual', amount: string) => void
    oncategorycreated: () => void
    oncategorydeleted: () => void
  }

  let { entries, onsave, oncategorycreated, oncategorydeleted }: Props = $props()

  let addModalContext = $state<{ type: 'income' | 'expense'; groups: { name: string; sortOrder: number }[]; editCategory?: { id: number; name: string; fixed: boolean; groupName: string } } | null>(null)
  let deleteModalContext = $state<{ categoryId: number; categoryName: string } | null>(null)

  let collapsedGroups = $state(new Set<string>())

  function toggleGroup(type: 'income' | 'expense', groupName: string) {
    const key = `${type}:${groupName}`
    const next = new Set(collapsedGroups)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    collapsedGroups = next
  }

  function isCollapsed(type: 'income' | 'expense', groupName: string): boolean {
    return collapsedGroups.has(`${type}:${groupName}`)
  }

  let incomeEntries = $derived(entries.filter(e => e.category_type === 'income'))
  let expenseEntries = $derived(entries.filter(e => e.category_type === 'expense'))

  function groupEntries(list: BudgetEntry[]): EntryGroup[] {
    const map = new Map<string, EntryGroup>()
    for (const e of list) {
      const key = e.category_group_name || ''
      if (!map.has(key)) {
        map.set(key, {
          groupName: key,
          groupSortOrder: 0,
          entries: [],
          plannedTotal: 0,
          actualTotal: 0,
        })
      }
      const g = map.get(key)!
      g.entries.push(e)
      g.plannedTotal += Number(e.planned_amount)
      g.actualTotal += Number(e.actual_amount)
    }
    return Array.from(map.values()).sort((a, b) => {
      const ai = list.indexOf(a.entries[0])
      const bi = list.indexOf(b.entries[0])
      return ai - bi
    })
  }

  let incomeGroups = $derived(groupEntries(incomeEntries))
  let expenseGroups = $derived(groupEntries(expenseEntries))

  function groupsForType(type: 'income' | 'expense'): { name: string; sortOrder: number }[] {
    const groups = type === 'income' ? incomeGroups : expenseGroups
    return groups.map(g => ({ name: g.groupName, sortOrder: g.groupSortOrder }))
  }

  function openAddModal(type: 'income' | 'expense') {
    addModalContext = { type, groups: groupsForType(type) }
  }

  function openEditModal(categoryId: number, categoryName: string, categoryType: 'income' | 'expense', groupName: string, groupSortOrder: number, fixed: boolean) {
    addModalContext = { type: categoryType, groups: groupsForType(categoryType), editCategory: { id: categoryId, name: categoryName, fixed, groupName } }
  }

  function openDeleteModal(categoryId: number, categoryName: string) {
    deleteModalContext = { categoryId, categoryName }
  }

  function sortable(node: HTMLElement) {
    const instance = Sortable.create(node, {
      animation: 150,
      handle: '.drag-handle',
      draggable: '.entry-row',
      filter: '.group-header, .add-row',
      ghostClass: 'drag-ghost',
      onEnd(evt) {
        // Extract new order from DOM
        const rows = node.querySelectorAll('.entry-row')
        const ids = Array.from(rows).map(r => Number((r as HTMLElement).dataset.categoryId))
        if (ids.length > 0) {
          reorderBudgetCategories(ids).then(() => oncategorycreated())
        }
      },
    })
    return {
      destroy() {
        instance.destroy()
      },
    }
  }

  function fmt(val: number): string {
    return val.toLocaleString('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }
</script>

<div class="budget-table">
  <table>
    <colgroup>
      <col class="col-name" />
      <col class="col-amount" />
      <col class="col-amount" />
      <col class="col-amount" />
    </colgroup>
    <thead>
      <tr>
        <th>Income</th>
        <th class="right">Planned/mo</th>
        <th class="right">Planned/yr</th>
        <th class="right">Actual/mo</th>
      </tr>
    </thead>
    {#each incomeGroups as group (group.groupName)}
      <tbody use:sortable>
        {#if incomeGroups.length > 1 || group.groupName}
          <tr class="group-header" class:collapsed={isCollapsed('income', group.groupName)} onclick={() => toggleGroup('income', group.groupName)}>
            <td>
              <span class="group-chevron">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                  {#if isCollapsed('income', group.groupName)}
                    <path d="M4 2 L10 6 L4 10 Z" />
                  {:else}
                    <path d="M2 4 L6 10 L10 4 Z" />
                  {/if}
                </svg>
              </span>
              {group.groupName || 'Other'}
            </td>
            <td class="right subtotal">{fmt(group.plannedTotal)}</td>
            <td class="right subtotal yearly">{fmt(group.plannedTotal * 12)}</td>
            <td class="right subtotal">{fmt(group.actualTotal)}</td>
          </tr>
        {/if}
        {#if !isCollapsed('income', group.groupName)}
          {#each group.entries as entry (entry.category_id)}
            <BudgetEntryRow {entry} {onsave} ondelete={openDeleteModal} onedit={openEditModal} />
          {/each}
        {/if}
      </tbody>
    {/each}
    <tfoot>
      <AddCategoryRow onadd={() => openAddModal('income')} />
    </tfoot>
  </table>

  <table>
    <colgroup>
      <col class="col-name" />
      <col class="col-amount" />
      <col class="col-amount" />
      <col class="col-amount" />
    </colgroup>
    <thead>
      <tr>
        <th>Expenses</th>
        <th class="right">Planned/mo</th>
        <th class="right">Planned/yr</th>
        <th class="right">Actual/mo</th>
      </tr>
    </thead>
    {#each expenseGroups as group (group.groupName)}
      <tbody use:sortable>
        {#if expenseGroups.length > 1 || group.groupName}
          <tr class="group-header" class:collapsed={isCollapsed('expense', group.groupName)} onclick={() => toggleGroup('expense', group.groupName)}>
            <td>
              <span class="group-chevron">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                  {#if isCollapsed('expense', group.groupName)}
                    <path d="M4 2 L10 6 L4 10 Z" />
                  {:else}
                    <path d="M2 4 L6 10 L10 4 Z" />
                  {/if}
                </svg>
              </span>
              {group.groupName || 'Other'}
            </td>
            <td class="right subtotal">{fmt(group.plannedTotal)}</td>
            <td class="right subtotal yearly">{fmt(group.plannedTotal * 12)}</td>
            <td class="right subtotal">{fmt(group.actualTotal)}</td>
          </tr>
        {/if}
        {#if !isCollapsed('expense', group.groupName)}
          {#each group.entries as entry (entry.category_id)}
            <BudgetEntryRow {entry} {onsave} ondelete={openDeleteModal} onedit={openEditModal} />
          {/each}
        {/if}
      </tbody>
    {/each}
    <tfoot>
      <AddCategoryRow onadd={() => openAddModal('expense')} />
    </tfoot>
  </table>
</div>

{#if addModalContext}
  <AddCategoryModal
    type={addModalContext.type}
    groups={addModalContext.groups}
    editCategory={addModalContext.editCategory}
    oncreated={oncategorycreated}
    onclose={() => addModalContext = null}
  />
{/if}

{#if deleteModalContext}
  <DeleteCategoryModal
    categoryId={deleteModalContext.categoryId}
    categoryName={deleteModalContext.categoryName}
    ondeleted={oncategorydeleted}
    onclose={() => deleteModalContext = null}
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
    width: 40%;
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
  :global(.group-header) {
    cursor: pointer;
    user-select: none;
  }
  :global(.group-header) td {
    padding: 0.5rem 0.75rem;
    background: #f1f3f5;
    font-weight: 600;
    font-size: 0.85rem;
    color: #495057;
    border-bottom: 1px solid #dee2e6;
  }
  :global(.group-header.collapsed) td {
    border-bottom: 2px solid #ced4da;
  }
  :global(.group-header) .subtotal {
    font-variant-numeric: tabular-nums;
    text-align: right;
  }
  :global(.group-header) .yearly {
    color: #888;
  }
  .group-chevron {
    display: inline-flex;
    align-items: center;
    margin-right: 0.35rem;
    opacity: 0;
    transition: opacity 0.15s;
    vertical-align: middle;
    color: #868e96;
  }
  :global(.group-header:hover) .group-chevron,
  :global(.group-header.collapsed) .group-chevron {
    opacity: 1;
  }
</style>
