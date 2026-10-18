<script lang="ts">
  import { t } from '../../lib/i18n/index.svelte'
  import { holdsMoney, sideOf, type VaultSnapshot, type VaultSnapshotLine } from '../../lib/crypto/vault'
  import { snapshotTotals } from '../../lib/budget/budgetEngine'
  import Money from '../../lib/util/Money.svelte'

  interface Props {
    snapshot: VaultSnapshot
    /**
     * A month's copy with receipts: what each line's receipts came to, in
     * rappen, by entry id — a Spent column beside the plan, as Belege shows it.
     */
    spent?: Map<string, number>
  }

  let { snapshot, spent }: Props = $props()

  interface LineRow {
    line: VaultSnapshotLine
    /** Position in `snapshot.lines`, used only to key the rendered rows. */
    index: number
  }

  interface LineCategory {
    categoryName: string
    rows: LineRow[]
  }

  /**
   * Under their categories, income side first, as the budget lays them out —
   * every type, not two. Savings, bills and purchases sit on the expense side
   * with the expenses, and were left out of the view altogether before.
   */
  function categoriesFor(side: 'income' | 'expense'): LineCategory[] {
    const map = new Map<string, LineCategory>()
    snapshot.lines.forEach((line, index) => {
      if (sideOf(line.type) !== side) return
      const key = line.categoryName || ''
      if (!map.has(key)) map.set(key, { categoryName: key, rows: [] })
      map.get(key)!.rows.push({ line, index })
    })
    return Array.from(map.values())
  }

  let incomeCategories = $derived(categoriesFor('income'))
  let expenseCategories = $derived(categoriesFor('expense'))
  let totals = $derived(snapshotTotals(snapshot))

</script>

<div class="editor">
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
      {#each [...incomeCategories, ...expenseCategories] as category (category.categoryName + ':' + sideOf(category.rows[0].line.type))}
        <tbody>
          <tr class="line-category">
            <td colspan={spent ? 3 : 2}>{category.categoryName || t('budget.uncategorised')}</td>
          </tr>
          {#each category.rows as row (row.index)}
            <tr class="line-row" class:income={row.line.type === 'income'} class:held={holdsMoney(row.line.type)}>
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
          <td class="right total income-total"><Money value={totals.income} /></td>
        </tr>
        <tr>
          <td>{t('budget.expenses')}</td>
          <td class="right total"><Money value={totals.expenses} /></td>
        </tr>
        <tr>
          <td>{t('budget.savings')}</td>
          <td class="right total held-total"><Money value={totals.savings} /></td>
        </tr>
        <tr>
          <td>{t('budget.unallocated')}</td>
          <td class="right total" class:income-total={Number(totals.unallocated) >= 0} class:expense-total={Number(totals.unallocated) < 0}>
            <Money value={totals.unallocated} />
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
  /* Savings, bills and purchases: held, not spent — the budget's blue. */
  .line-row.held .line-amount,
  .held-total { color: var(--money-held); }
</style>
