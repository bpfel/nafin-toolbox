<script lang="ts">
  import { t } from '../../lib/i18n/index.svelte'
  import { untrack } from 'svelte'
  import type { VaultArchive, VaultArchiveLine } from '../../lib/crypto/vault'

  interface Props {
    archive: VaultArchive
    /**
     * Commits a new name. May throw — the engine refuses an empty name — and the
     * message is caught here so it lands next to the field the user typed in.
     */
    onrename: (name: string) => void
  }

  let { archive, onrename }: Props = $props()

  // Seeded once: the editor is mounted fresh per archive, and the draft must not
  // be yanked out from under a half-typed rename.
  let nameDraft = $state(untrack(() => archive.name))
  let nameError = $state<string | null>(null)

  interface LineRow {
    line: VaultArchiveLine
    /** Position in `archive.lines`, used only to key the rendered rows. */
    index: number
  }

  interface LineCategory {
    categoryName: string
    rows: LineRow[]
  }

  function categoriesFor(type: 'income' | 'expense'): LineCategory[] {
    const map = new Map<string, LineCategory>()
    archive.lines.forEach((line, index) => {
      if (line.type !== type) return
      const key = line.categoryName || ''
      if (!map.has(key)) map.set(key, { categoryName: key, rows: [] })
      map.get(key)!.rows.push({ line, index })
    })
    return Array.from(map.values())
  }

  let incomeCategories = $derived(categoriesFor('income'))
  let expenseCategories = $derived(categoriesFor('expense'))

  function totalFor(type: 'income' | 'expense'): number {
    return archive.lines
      .filter(l => l.type === type)
      .reduce((sum, l) => sum + Number(l.plannedAmount), 0)
  }

  let incomeTotal = $derived(totalFor('income'))
  let expenseTotal = $derived(totalFor('expense'))
  let balance = $derived(incomeTotal - expenseTotal)

  function commitName() {
    if (nameDraft.trim() === archive.name) {
      nameError = null
      return
    }
    try {
      onrename(nameDraft)
      nameError = null
    } catch (e) {
      nameError = e instanceof Error ? e.message : t('error.renameArchive')
    }
  }

  function handleNameKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault()
      ;(e.target as HTMLInputElement).blur()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      nameDraft = archive.name
      nameError = null
      ;(e.target as HTMLInputElement).blur()
    }
  }

  function fmt(val: number): string {
    return val.toLocaleString('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }
</script>

<div class="editor">
  <label class="rename-field">
    <span class="rename-label">{t('field.name')}</span>
    <input
      type="text"
      class="rename-input"
      bind:value={nameDraft}
      onblur={commitName}
      onkeydown={handleNameKeydown}
    />
  </label>
  {#if nameError}
    <p class="error" role="alert">{nameError}</p>
  {/if}

  {#if archive.lines.length === 0}
    <p class="empty">{t('archive.empty')}</p>
  {:else}
    <table>
      <thead>
        <tr>
          <th class="col-name">{t('archive.entryColumn')}</th>
          <th class="right col-amount">{t('budget.plannedMo')}</th>
        </tr>
      </thead>
      {#each [...incomeCategories, ...expenseCategories] as category (category.categoryName + ':' + category.rows[0].line.type)}
        <tbody>
          <tr class="line-category">
            <td colspan="2">{category.categoryName || 'Other'}</td>
          </tr>
          {#each category.rows as row (row.index)}
            <tr class="line-row" class:income={row.line.type === 'income'}>
              <td class="line-name">{row.line.entryName}</td>
              <td class="line-amount">{fmt(Number(row.line.plannedAmount))}</td>
            </tr>
          {/each}
        </tbody>
      {/each}
      <tfoot>
        <tr>
          <td>{t('budget.income')}</td>
          <td class="right total income-total">{fmt(incomeTotal)}</td>
        </tr>
        <tr>
          <td>{t('budget.expenses')}</td>
          <td class="right total expense-total">{fmt(expenseTotal)}</td>
        </tr>
        <tr>
          <td>{t('budget.savings')}</td>
          <td class="right total" class:income-total={balance >= 0} class:expense-total={balance < 0}>
            {fmt(balance)}
          </td>
        </tr>
      </tfoot>
    </table>
  {/if}
</div>

<style>
  .editor {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.75rem 0 0.25rem;
  }
  .rename-field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    max-width: 22rem;
  }
  .rename-label {
    font-size: 0.75rem;
    color: #888;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .rename-input {
    padding: 0.45rem 0.6rem;
    border: 1px solid #ccc;
    border-radius: 6px;
    font-size: 0.95rem;
    outline: none;
  }
  .rename-input:focus {
    border-color: #2d6a4f;
    box-shadow: 0 0 0 2px rgba(45, 106, 79, 0.2);
  }
  .error {
    color: #c0392b;
    font-size: 0.85rem;
    margin: 0;
    padding: 0.4rem 0.5rem;
    background: #fdecea;
    border-radius: 4px;
  }
  .empty {
    color: #888;
    font-size: 0.9rem;
    margin: 0;
  }
  table {
    width: 100%;
    table-layout: fixed;
    border-collapse: collapse;
    font-size: 0.9rem;
  }
  .col-name {
    width: 60%;
  }
  .col-amount {
    width: 40%;
  }
  th {
    text-align: left;
    padding: 0.4rem 0.5rem;
    font-size: 0.7rem;
    color: #888;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    border-bottom: 1px solid #dee2e6;
  }
  th.right {
    text-align: right;
  }
  .line-category td {
    padding: 0.35rem 0.5rem;
    background: #f1f3f5;
    font-weight: 600;
    font-size: 0.8rem;
    color: #495057;
  }
  .line-row td {
    padding: 0.2rem 0.5rem;
    border-bottom: 1px solid #eee;
  }
  .line-row.income td {
    background: #f0fdf4;
  }
  .line-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .line-amount {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  tfoot td {
    padding: 0.35rem 0.5rem;
    font-size: 0.8rem;
    color: #666;
    border-top: 1px solid #dee2e6;
  }
  tfoot .right {
    text-align: right;
  }
  .total {
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .income-total { color: #2d6a4f; }
  .expense-total { color: #c0392b; }
</style>
