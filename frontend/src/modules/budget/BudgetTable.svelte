<script lang="ts">
  import Sortable from 'sortablejs'
  import type { PeriodEntryView } from '../../lib/budget/budgetEngine'
  import * as engine from '../../lib/budget/budgetEngine'
  import type { VaultData } from '../../lib/crypto/vault'
  import BudgetEntryRow from './BudgetEntryRow.svelte'
  import AddCategoryRow from './AddCategoryRow.svelte'
  import AddCategoryModal from './AddCategoryModal.svelte'
  import DeleteCategoryModal from './DeleteCategoryModal.svelte'

  interface EntryGroup {
    groupName: string
    groupId: string
    entries: PeriodEntryView[]
    plannedTotal: number
    actualTotal: number
  }

  interface Props {
    entries: PeriodEntryView[]
    vault: VaultData
    year: number
    month: number
    onsave: (categoryId: string, field: 'planned' | 'actual', amount: string) => void
    oncategorycreated: () => void
    oncategorydeleted: () => void
  }

  let { entries, vault, year, month, onsave, oncategorycreated, oncategorydeleted }: Props = $props()

  let addModalContext = $state<{ type: 'income' | 'expense'; groups: { name: string; id: string }[]; editCategory?: { id: string; name: string; fixed: boolean; groupName: string; plannedAmount: string; actualAmount: string } } | null>(null)
  let deleteModalContext = $state<{ categoryId: string; categoryName: string } | null>(null)

  let viewMode = $state<'monthly' | 'yearly'>('monthly')
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

  let incomeEntries = $derived(entries.filter(e => e.categoryType === 'income'))
  let expenseEntries = $derived(entries.filter(e => e.categoryType === 'expense'))

  function groupEntries(list: PeriodEntryView[]): EntryGroup[] {
    const map = new Map<string, EntryGroup>()
    for (const e of list) {
      const key = e.categoryGroupName || ''
      if (!map.has(key)) {
        map.set(key, {
          groupName: key,
          groupId: e.categoryGroupId,
          entries: [],
          plannedTotal: 0,
          actualTotal: 0,
        })
      }
      const g = map.get(key)!
      g.entries.push(e)
      g.plannedTotal += Number(e.plannedAmount)
      g.actualTotal += Number(e.actualAmount)
    }
    return Array.from(map.values()).sort((a, b) => {
      const ai = list.indexOf(a.entries[0])
      const bi = list.indexOf(b.entries[0])
      return ai - bi
    })
  }

  let incomeGroups = $derived(groupEntries(incomeEntries))
  let expenseGroups = $derived(groupEntries(expenseEntries))

  function groupsForType(type: 'income' | 'expense'): { name: string; id: string }[] {
    const groups = type === 'income' ? incomeGroups : expenseGroups
    return groups.map(g => ({ name: g.groupName, id: g.groupId }))
  }

  function openAddModal(type: 'income' | 'expense') {
    addModalContext = { type, groups: groupsForType(type) }
  }

  function openEditModal(categoryId: string, categoryName: string, categoryType: 'income' | 'expense', groupName: string, fixed: boolean, plannedAmount: string, actualAmount: string) {
    addModalContext = { type: categoryType, groups: groupsForType(categoryType), editCategory: { id: categoryId, name: categoryName, fixed, groupName, plannedAmount, actualAmount } }
  }

  function openDeleteModal(categoryId: string, categoryName: string) {
    deleteModalContext = { categoryId, categoryName }
  }

  function handleCategoryCreated() {
    oncategorycreated()
  }

  function handleCategoryDeleted(categoryId: string) {
    engine.deleteCategory(vault, categoryId)
    oncategorydeleted()
  }

  function sortable(node: HTMLElement) {
    const instance = Sortable.create(node, {
      animation: 150,
      handle: '.drag-handle',
      draggable: '.entry-row',
      filter: '.group-header, .add-row',
      ghostClass: 'drag-ghost',
      onEnd() {
        const rows = node.querySelectorAll('.entry-row')
        const ids = Array.from(rows).map(r => (r as HTMLElement).dataset.categoryId!).filter(Boolean)
        if (ids.length > 0) {
          engine.reorderCategories(vault, ids)
          oncategorycreated()
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

<div class="budget-table" class:view-yearly={viewMode === 'yearly'}>
  <div class="table-toolbar">
    <button
      class="view-toggle"
      onclick={() => viewMode = viewMode === 'monthly' ? 'yearly' : 'monthly'}
    >
      {viewMode === 'monthly' ? 'mo' : 'yr'}
    </button>
  </div>

  <table>
    <thead>
      <tr>
        <th class="col-name">Income</th>
        <th class="right col-amount col-planned-mo">Planned/mo</th>
        <th class="right col-amount col-planned-yr">Planned/yr</th>
        <th class="right col-amount">Actual/mo</th>
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
            <td class="right subtotal col-planned-mo">{fmt(group.plannedTotal)}</td>
            <td class="right subtotal yearly col-planned-yr">{fmt(group.plannedTotal * 12)}</td>
            <td class="right subtotal">{fmt(group.actualTotal)}</td>
          </tr>
        {/if}
        {#if !isCollapsed('income', group.groupName)}
          {#each group.entries as entry (entry.categoryId)}
            <BudgetEntryRow {entry} {onsave} {viewMode} ondelete={openDeleteModal} onedit={openEditModal} />
          {/each}
        {/if}
      </tbody>
    {/each}
    <tfoot>
      <AddCategoryRow onadd={() => openAddModal('income')} />
    </tfoot>
  </table>

  <table>
    <thead>
      <tr>
        <th class="col-name">Expenses</th>
        <th class="right col-amount col-planned-mo">Planned/mo</th>
        <th class="right col-amount col-planned-yr">Planned/yr</th>
        <th class="right col-amount">Actual/mo</th>
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
            <td class="right subtotal col-planned-mo">{fmt(group.plannedTotal)}</td>
            <td class="right subtotal yearly col-planned-yr">{fmt(group.plannedTotal * 12)}</td>
            <td class="right subtotal">{fmt(group.actualTotal)}</td>
          </tr>
        {/if}
        {#if !isCollapsed('expense', group.groupName)}
          {#each group.entries as entry (entry.categoryId)}
            <BudgetEntryRow {entry} {onsave} {viewMode} ondelete={openDeleteModal} onedit={openEditModal} />
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
    {vault}
    oncreated={handleCategoryCreated}
    onclose={() => addModalContext = null}
    {onsave}
  />
{/if}

{#if deleteModalContext}
  <DeleteCategoryModal
    categoryId={deleteModalContext.categoryId}
    categoryName={deleteModalContext.categoryName}
    ondeleted={() => handleCategoryDeleted(deleteModalContext!.categoryId)}
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
    .group-chevron {
      opacity: 1;
    }
  }

  @media (max-width: 768px) {
    .table-toolbar {
      display: flex;
      justify-content: flex-end;
      margin-bottom: 0.5rem;
    }
    th {
      padding: 0.5rem;
      font-size: 0.8rem;
    }
    .col-name {
      width: 50%;
    }
    .col-amount {
      width: 25%;
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
    :global(.group-header) td {
      padding: 0.4rem 0.5rem;
    }
  }
</style>
