<script lang="ts">
  import { t } from '../../lib/i18n/index.svelte'
  import type { Beleg, VaultData } from '../../lib/crypto/vault'
  import { reviewMonth, reviewableMonths, thisMonth, type ReviewRow } from '../../lib/belege/belegeEngine'
  import { monthLabel } from '../../lib/util/months'
  import Money from '../../lib/util/Money.svelte'
  import RecordRow from './RecordRow.svelte'

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
  }

  let { vault, names, onopen }: Props = $props()

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
      <li>
        <button
          class="line"
          aria-expanded={open === key(row)}
          disabled={row.belege.length === 0}
          onclick={() => (open = open === key(row) ? null : key(row))}
        >
          <span class="name">
            {row.entryId === null ? t('spending.unassigned') : row.entryName}
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
        {#if open === key(row)}
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

  .totals {
    display: flex;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.75rem 0.25rem;
    font-weight: 600;
  }
</style>
