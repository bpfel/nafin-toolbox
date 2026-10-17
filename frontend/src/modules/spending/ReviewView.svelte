<script lang="ts">
  import { t } from '../../lib/i18n/index.svelte'
  import type { Beleg, VaultData } from '../../lib/crypto/vault'
  import { reviewMonth, reviewableMonths, thisMonth, type ReviewRow } from '../../lib/belege/belegeEngine'
  import { monthLabel } from '../../lib/util/months'
  import Money from '../../lib/util/Money.svelte'
  import RecordRow from './RecordRow.svelte'
  import { commit, saveNow } from '../../lib/crypto/vaultStore.svelte'
  import { notify } from '../../lib/sync/notices.svelte'
  import { emptyTape } from '../../lib/sync/source'
  import Balances from './Balances.svelte'

  /**
   * A month against the budget it belongs to.
   *
   * The current month reads against the live plan. A finished one reads
   * against its own frozen copy, taken when it ended, so changing Rent today
   * does not change what October says about October. Each line opens to its
   * records.
   */
  interface Props {
    vault: VaultData
    names?: Record<string, string>
    onopen?: (beleg: Beleg) => void
    /** The household's members, for who owes whom; empty in a personal budget. */
    members?: { id: string; name: string }[]
    me?: string
    readOnly?: boolean
  }

  let { vault, names, onopen, members = [], me = '', readOnly = false }: Props = $props()

  /** Only where there is somebody to owe: two members, or records that say who paid. */
  let shared = $derived(members.length > 1 || vault.belege.some(b => b.paidBy !== undefined))

  let current = $derived(thisMonth())
  let months = $derived(reviewableMonths(vault, current))
  let month = $state(thisMonth())
  let index = $derived(Math.max(0, months.indexOf(month)))
  let review = $derived(reviewMonth(vault, month))

  /** Which line is open, by entry id; `''` for Unassigned. */
  let open = $state<string | null>(null)
  const key = (row: ReviewRow) => row.entryId ?? ''

  let rows = $derived(review.unassigned.spent > 0 ? [...review.rows, review.unassigned] : review.rows)

  function go(to: number) {
    const next = months[to]
    if (next) {
      month = next
      open = null
    }
  }

  /**
   * Asked where the question arises: a planned line with nothing recorded, this
   * month. Rent at "0 / 1'800" is how somebody finds out the mark exists. Not
   * on a finished month — its copy is fixed — and not to a reader.
   */
  function mayAsk(row: ReviewRow): boolean {
    return changeable && row.entryId !== null && !row.automatic && (row.planned ?? 0) > 0 && row.spent === 0
  }

  /** Only this month's lines, and only by a writer: a finished month keeps its copy. */
  let changeable = $derived(!readOnly && !review.closedAt && month === current)

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
    open = null
  }

  function closedOn(iso: string): string {
    const d = new Date(iso)
    return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`
  }
</script>

<div class="review">
  <div class="switcher">
    <!-- Older is to the right in the list, so "previous" steps forward in it. -->
    <button class="step" aria-label={t('spending.previousMonth')} disabled={index >= months.length - 1} onclick={() => go(index + 1)}>‹</button>
    <h3 class="month">{monthLabel(month)}</h3>
    <button class="step" aria-label={t('spending.nextMonth')} disabled={index === 0} onclick={() => go(index - 1)}>›</button>
  </div>

  <p class="basis">
    {review.closedAt ? t('spending.asOf', { date: closedOn(review.closedAt) }) : t('spending.live')}
  </p>

  {#if review.spent === 0 && review.rows.every(r => r.spent === 0)}
    <p class="nothing">{t('spending.nothingThisMonth')}</p>
  {/if}

  <ul class="lines">
    {#each rows as row (key(row))}
      {@const over = row.planned !== null && row.spent > row.planned}
      <li class:automatic={row.automatic}>
        <button
          class="line"
          aria-expanded={open === key(row)}
          disabled={row.belege.length === 0 && !(row.automatic && changeable)}
          onclick={() => (open = open === key(row) ? null : key(row))}
        >
          <span class="name">
            {row.entryId === null ? t('spending.unassigned') : row.entryName}
            {#if row.automatic}<span class="auto">{t('spending.automatic')}</span>{/if}
          </span>
          <span class="figures">
            <span class="spent" class:over><Money value={row.spent} cents /></span>
            <span class="planned">
              {#if row.planned === null}
                {row.entryId === null ? '' : t('spending.notPlanned')}
              {:else}
                / <Money value={row.planned} cents />
              {/if}
            </span>
          </span>
          {#if row.planned !== null && row.planned > 0}
            <span class="bar" aria-hidden="true">
              <span class="fill" class:over style:width="{Math.min(100, (row.spent / row.planned) * 100)}%"></span>
            </span>
          {/if}
        </button>
        {#if mayAsk(row)}
          <button class="ask" onclick={() => markAutomatic(row)}>{t('spending.markAutomatic')}</button>
        {/if}
        {#if open === key(row)}
          {#if row.automatic && changeable}
            <button class="ask" onclick={() => unmarkAutomatic(row.entryId!)}>{t('spending.unmarkAutomatic')}</button>
          {/if}
          <div class="records">
            {#each row.belege as beleg (beleg.id)}
              <RecordRow {beleg} {vault} {names} showEntry={false} onopen={onopen ? () => onopen(beleg) : undefined} />
            {/each}
          </div>
        {/if}
      </li>
    {/each}
  </ul>

  <div class="totals">
    <span>{t('spending.total')}</span>
    <span class="figures">
      <span class="spent" class:over={review.spent > review.planned}><Money value={review.spent} cents /></span>
      <span class="planned">/ <Money value={review.planned} cents /></span>
    </span>
  </div>

  {#if shared}
    <Balances {vault} {month} {members} {me} {readOnly} />
  {/if}
</div>

<style>
  .switcher {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .month {
    margin: 0;
    font-size: 1.05rem;
    text-align: center;
  }

  .step {
    width: 44px;
    height: 44px;
    border: 1px solid var(--rule);
    border-radius: 8px;
    background: var(--surface);
    color: inherit;
    font-size: 1.3rem;
    cursor: pointer;
  }

  .step:disabled {
    opacity: 0.35;
    cursor: default;
  }

  .basis,
  .nothing {
    margin: 0.5rem 0 0.75rem;
    font-size: 0.85rem;
    color: var(--ink-faint);
    text-align: center;
  }

  .lines {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .line {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 0.25rem 0.75rem;
    width: 100%;
    padding: 0.6rem 0.25rem;
    border: none;
    border-bottom: 1px solid var(--rule);
    background: none;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .line:disabled {
    cursor: default;
  }

  .name {
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .figures {
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
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
    padding: 0 0 0.5rem 0.75rem;
  }

  /* Counted, not receipted: greyed, so the eye goes to what was spent by hand. */
  .automatic .line {
    color: var(--ink-faint);
  }

  .automatic .fill {
    background: var(--ink-faint);
  }

  .auto {
    margin-left: 0.4rem;
    font-size: 0.75rem;
    font-style: italic;
  }

  .ask {
    margin: 0.3rem 0 0.4rem 0.25rem;
    padding: 0.2rem 0.6rem;
    border: 1px dashed var(--rule);
    border-radius: 999px;
    background: none;
    color: var(--ink-faint);
    font: inherit;
    font-size: 0.8rem;
    cursor: pointer;
  }

  .ask:hover {
    color: var(--ink);
    border-color: var(--ink-faint);
  }

  .totals {
    display: flex;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.75rem 0.25rem;
    font-weight: 600;
  }
</style>
