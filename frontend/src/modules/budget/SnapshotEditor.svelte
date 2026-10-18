<script lang="ts">
  import { t } from '../../lib/i18n/index.svelte'
  import { untrack } from 'svelte'
  import type { VaultSnapshot, VaultSnapshotLine } from '../../lib/crypto/vault'
  import Money from '../../lib/util/Money.svelte'
  import { monthLabel } from '../../lib/util/months'

  interface Props {
    snapshot: VaultSnapshot
    /**
     * Commits a new name. May throw — the engine refuses an empty name — and the
     * message is caught here so it lands next to the field the user typed in.
     */
    onrename: (name: string) => void
    /**
     * A month's copy with receipts: what each line's receipts came to, in
     * rappen, by entry id — a Spent column beside the plan, as Belege shows it.
     */
    spent?: Map<string, number>
  }

  let { snapshot, onrename, spent }: Props = $props()

  // Seeded once: the editor is mounted fresh per snapshot, and the draft must not
  // be yanked out from under a half-typed rename.
  let nameDraft = $state(untrack(() => snapshot.name))
  let nameError = $state<string | null>(null)

  interface LineRow {
    line: VaultSnapshotLine
    /** Position in `snapshot.lines`, used only to key the rendered rows. */
    index: number
  }

  interface LineCategory {
    categoryName: string
    rows: LineRow[]
  }

  function categoriesFor(type: 'income' | 'expense'): LineCategory[] {
    const map = new Map<string, LineCategory>()
    snapshot.lines.forEach((line, index) => {
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
    return snapshot.lines
      .filter(l => l.type === type)
      .reduce((sum, l) => sum + Number(l.plannedAmount), 0)
  }

  let incomeTotal = $derived(totalFor('income'))
  let expenseTotal = $derived(totalFor('expense'))
  let balance = $derived(incomeTotal - expenseTotal)

  function commitName() {
    if (nameDraft.trim() === snapshot.name) {
      nameError = null
      return
    }
    try {
      onrename(nameDraft)
      nameError = null
    } catch (e) {
      nameError = e instanceof Error ? e.message : t('error.renameSnapshot')
    }
  }

  function handleNameKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault()
      ;(e.target as HTMLInputElement).blur()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      nameDraft = snapshot.name
      nameError = null
      ;(e.target as HTMLInputElement).blur()
    }
  }
</script>

<div class="editor">
  <label class="rename-field">
    <span class="rename-label">{t('field.name')}</span>
    <input
      type="text"
      class="rename-input"
      placeholder={snapshot.month ? monthLabel(snapshot.month) : undefined}
      bind:value={nameDraft}
      onblur={commitName}
      onkeydown={handleNameKeydown}
    />
  </label>
  {#if nameError}
    <p class="error" role="alert">{nameError}</p>
  {/if}

  {#if snapshot.lines.length === 0}
    <p class="empty">{t('snapshot.empty')}</p>
  {:else}
    <table>
      <thead>
        <tr>
          <th class="col-name">{t('snapshot.entryColumn')}</th>
          <th class="right col-amount">{t('budget.plannedMo')}</th>
          {#if spent}<th class="right col-amount">{t('spending.spent')}</th>{/if}
        </tr>
      </thead>
      {#each [...incomeCategories, ...expenseCategories] as category (category.categoryName + ':' + category.rows[0].line.type)}
        <tbody>
          <tr class="line-category">
            <td colspan={spent ? 3 : 2}>{category.categoryName || t('budget.uncategorised')}</td>
          </tr>
          {#each category.rows as row (row.index)}
            <tr class="line-row" class:income={row.line.type === 'income'}>
              <td class="line-name">{row.line.entryName}</td>
              <td class="line-amount"><Money value={row.line.plannedAmount} /></td>
              {#if spent}
                {@const out = row.line.entryId ? spent.get(row.line.entryId) : undefined}
                <td class="line-amount" class:over={out !== undefined && out > Math.round(Number(row.line.plannedAmount) * 100)}>
                  {#if out !== undefined}<Money value={out} cents />{/if}
                </td>
              {/if}
            </tr>
          {/each}
        </tbody>
      {/each}
      <tfoot>
        <tr>
          <td>{t('budget.income')}</td>
          <td class="right total income-total"><Money value={incomeTotal} /></td>
        </tr>
        <tr>
          <td>{t('budget.expenses')}</td>
          <td class="right total expense-total"><Money value={expenseTotal} /></td>
        </tr>
        <tr>
          <td>{t('budget.savings')}</td>
          <td class="right total" class:income-total={balance >= 0} class:expense-total={balance < 0}>
            <Money value={balance} />
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
    color: var(--ink-faint);
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
    color: var(--ink-faint);
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
    color: var(--ink-faint);
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
    font-weight: 500;
    font-size: 0.8rem;
    color: #495057;
  }
  .line-row td {
    padding: 0.2rem 0.5rem;
    border-bottom: 1px solid var(--rule);
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
    font-weight: 500;
    font-variant-numeric: tabular-nums;
  }
  .income-total { color: #2d6a4f; }
  .line-amount.over { color: var(--alarm); }
  .expense-total { color: #c0392b; }
</style>
