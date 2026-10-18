<script lang="ts">
  import { t } from '../../lib/i18n/index.svelte'
  import type { Beleg, VaultData } from '../../lib/crypto/vault'
  import { reviewMonth, spentShare, type ReviewRow } from '../../lib/belege/belegeEngine'
  import { formatDate, thisMonth } from '../../lib/util/calendar'
  import { monthLabel } from '../../lib/util/months'
  import Money from '../../lib/util/Money.svelte'
  import RecordRow from './RecordRow.svelte'
  import SpendingSummary from './SpendingSummary.svelte'
  import { commit, saveNow } from '../../lib/crypto/vaultStore.svelte'
  import { notify } from '../../lib/sync/notices.svelte'
  import { emptyTape } from '../../lib/sync/source'
  import Balances from './Balances.svelte'

  /**
   * A month against the budget it belongs to, in the pieces Budget is built
   * from: a summary card on top, then the lines on one card under the same
   * category headings Budget uses, then — in a household — who owes whom on a
   * card of its own. The month is stepped from the summary card's header.
   *
   * The current month reads against the live plan. A finished one reads
   * against its own frozen copy, so changing Rent today does not change what
   * October says about October. Each line opens to its records.
   */
  interface Props {
    vault: VaultData
    month: string
    names?: Record<string, string>
    onopen?: (beleg: Beleg) => void
    /** The household's members, for who owes whom; empty in a personal budget. */
    members?: { id: string; name: string }[]
    me?: string
    readOnly?: boolean
    /** Edit mode is on: payments can be deleted and the split changed. */
    editing?: boolean
    /** Stepping months; absent at the newest or the oldest. */
    onprevious?: () => void
    onnext?: () => void
  }

  let { vault, month, names, onopen, members = [], me = '', readOnly = false, editing = false, onprevious, onnext }: Props = $props()

  /** Only where there is somebody to owe: two members, or records that say who paid. */
  let shared = $derived(members.length > 1 || vault.belege.some(b => b.paidBy !== undefined))

  let current = $derived(thisMonth())
  let review = $derived(reviewMonth(vault, month))

  /** Only this month's lines, and only by a writer: a finished month keeps its copy. */
  let changeable = $derived(!readOnly && !review.closedAt && month === current)

  /**
   * The lines receipts are recorded against, under their categories in the
   * order they first appear — which is the budget's order. Lines paid
   * automatically are gathered into one row at the foot instead: rent and
   * insurances would otherwise be half the list, and nothing about them
   * changes from month to month.
   */
  let groups = $derived.by(() => {
    const out: { name: string; rows: ReviewRow[] }[] = []
    for (const row of review.rows.filter(r => !r.automatic)) {
      const last = out[out.length - 1]
      if (last && last.name === row.categoryName) last.rows.push(row)
      else {
        const earlier = out.find(g => g.name === row.categoryName)
        if (earlier) earlier.rows.push(row)
        else out.push({ name: row.categoryName, rows: [row] })
      }
    }
    return out
  })
  let automatic = $derived(review.rows.filter(r => r.automatic))
  let automaticTotal = $derived(automatic.reduce((sum, r) => sum + r.spent, 0))

  /** Which line is open, by entry id; `''` for Unassigned, `'auto'` for the automatic row. */
  let open = $state<string | null>(null)
  const key = (row: ReviewRow) => row.entryId ?? ''

  $effect(() => {
    void month
    open = null
  })

  /**
   * Asked where the question arises: a planned line with nothing recorded, this
   * month. Rent at "0 / 1'800" is how somebody finds out the mark exists.
   */
  function mayAsk(row: ReviewRow): boolean {
    return changeable && row.entryId !== null && (row.planned ?? 0) > 0 && row.spent === 0
  }

  /** Said, with Undo, because one tap is easy to make by mistake. */
  function markAutomatic(row: ReviewRow) {
    const entryId = row.entryId!
    commit('setEntryAutomatic', entryId, true)
    saveNow()
    notify({
      kind: 'automatic',
      subject: row.entryName,
      undo: { kind: 'setEntryAutomatic', args: [entryId, false], tape: emptyTape() },
    })
  }

  /** Back to receipts: the line is offered for records again, and counts what they say. */
  function unmarkAutomatic(entryId: string) {
    commit('setEntryAutomatic', entryId, false)
    saveNow()
  }
</script>

{#snippet line(row: ReviewRow)}
  {@const over = row.planned !== null && row.spent > row.planned}
  <li>
    <button
      class="line"
      aria-expanded={open === key(row)}
      disabled={row.belege.length === 0}
      onclick={() => (open = open === key(row) ? null : key(row))}
    >
      <span class="name">{row.entryId === null ? t('spending.unassigned') : row.entryName}</span>
      <span class="figures">
        <span class="spent" class:over><Money value={row.spent} cents /></span>
        {#if row.planned !== null}
          <span class="planned">/ <Money value={row.planned} cents /></span>
        {:else if row.entryId !== null}
          <span class="planned">{t('spending.notPlanned')}</span>
        {/if}
      </span>
      {#if row.planned !== null && row.planned > 0}
        <span class="bar" aria-hidden="true">
          <span class="fill" class:over style:width="{spentShare(row.spent, row.planned)}%"></span>
        </span>
      {/if}
    </button>
    {#if mayAsk(row)}
      <button class="ask" onclick={() => markAutomatic(row)}>{t('spending.markAutomatic')}</button>
    {/if}
    {#if open === key(row)}
      <div class="records">
        {#each row.belege as beleg (beleg.id)}
          <RecordRow {beleg} {vault} {names} showEntry={false} onopen={onopen ? () => onopen(beleg) : undefined} />
        {/each}
      </div>
    {/if}
  </li>
{/snippet}

<div class="review">
  <SpendingSummary
    title={monthLabel(month)}
    planned={review.planned}
    spent={review.spent}
    basis={review.closedAt ? t('spending.asOf', { date: formatDate(review.closedAt) }) : t('spending.live')}
    {onprevious}
    {onnext}
    stepper
  />

  <div class="card">
    {#if review.spent === automaticTotal && review.unassigned.spent === 0 && groups.every(g => g.rows.every(r => r.spent === 0))}
      <p class="nothing">{t('spending.nothingThisMonth')}</p>
    {/if}

    {#each groups as group (group.name)}
      <h4 class="category">{group.name}</h4>
      <ul class="lines">
        {#each group.rows as row (key(row))}
          {@render line(row)}
        {/each}
      </ul>
    {/each}

    {#if automatic.length > 0 || review.unassigned.spent > 0}
      <ul class="lines foot">
        {#if automatic.length > 0}
          <li>
            <button class="line" aria-expanded={open === 'auto'} onclick={() => (open = open === 'auto' ? null : 'auto')}>
              <span class="name">{t('spending.automaticGroup')}</span>
              <span class="figures"><span class="spent"><Money value={automaticTotal} cents /></span></span>
            </button>
            {#if open === 'auto'}
              <ul class="automatic">
                {#each automatic as row (key(row))}
                  <li>
                    <span class="name">{row.entryName}</span>
                    {#if changeable}
                      <button class="ask" onclick={() => unmarkAutomatic(row.entryId!)}>{t('spending.unmarkAutomatic')}</button>
                    {/if}
                    <span class="figures"><Money value={row.spent} cents /></span>
                  </li>
                {/each}
              </ul>
            {/if}
          </li>
        {/if}
        {#if review.unassigned.spent > 0}
          {@render line(review.unassigned)}
        {/if}
      </ul>
    {/if}
  </div>

  {#if shared}
    <Balances {vault} {month} {members} {me} {readOnly} {editing} />
  {/if}
</div>

<style>
  .card {
    background: var(--surface);
    border-radius: 8px;
    box-shadow: var(--shadow-card);
    padding: 0.25rem 0 0.5rem;
    overflow: hidden;
  }

  .nothing {
    margin: 0.75rem 0.9rem;
    font-size: 0.85rem;
    color: var(--ink-faint);
  }

  /* Budget's category heading: a shade larger, set apart by space, not a rule. */
  .category {
    margin: 0;
    padding: 0.85rem 0.9rem 0.3rem;
    font-size: 1.05rem;
    font-weight: 500;
  }

  .lines {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .foot {
    margin-top: 0.5rem;
    border-top: 1px solid var(--rule);
  }

  .line {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 0.25rem 0.75rem;
    width: 100%;
    padding: 0.55rem 0.9rem;
    border: none;
    background: none;
    color: inherit;
    font: inherit;
    font-size: 0.92rem;
    text-align: left;
    cursor: pointer;
  }

  .line:disabled {
    cursor: default;
  }

  .line:hover:not(:disabled) {
    background: var(--sunken);
  }

  .name {
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .figures {
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    text-align: right;
  }

  .planned {
    color: var(--ink-faint);
    font-size: 0.85rem;
  }

  .over {
    color: var(--alarm);
  }

  .bar {
    grid-column: 1 / -1;
    height: 4px;
    border-radius: 2px;
    background: var(--sunken);
    overflow: hidden;
  }

  .fill {
    display: block;
    height: 100%;
    background: var(--accent);
  }

  .fill.over {
    background: var(--alarm);
  }

  .records {
    margin: 0 0.9rem 0.5rem;
    border-left: 2px solid var(--rule);
  }

  .automatic {
    list-style: none;
    margin: 0 0.9rem 0.5rem;
    padding: 0 0 0 0.75rem;
    border-left: 2px solid var(--rule);
    color: var(--ink-faint);
    font-size: 0.88rem;
  }

  .automatic li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem 0.75rem;
    padding: 0.35rem 0;
  }

  .automatic .name {
    flex: 1 1 auto;
  }

  .ask {
    margin: 0 0 0.4rem 0.9rem;
    padding: 0.2rem 0.6rem;
    border: 1px dashed var(--rule);
    border-radius: 999px;
    background: none;
    color: var(--ink-faint);
    font: inherit;
    font-size: 0.8rem;
    cursor: pointer;
  }

  .automatic .ask {
    margin: 0;
  }

  .ask:hover {
    color: var(--ink);
    border-color: var(--ink-faint);
  }
</style>
