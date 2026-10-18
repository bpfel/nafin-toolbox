<script lang="ts">
  import { t } from '../../lib/i18n/index.svelte'
  import type { PlanChange } from '../../lib/budget/changes'
  import Money from '../../lib/util/Money.svelte'
  import { monthLabel } from '../../lib/util/months'

  /**
   * What changed after a past version, from the month the next one started:
   * worked out by the app, not written by anybody. Every change is listed;
   * past a handful the list folds, and opens to all of them — a move touches a
   * dozen lines, and the one being looked for must not be the one that was cut.
   *
   * A line added or removed is marked + or − and coloured, and still says so
   * in words, so the colour is never the only way to tell; a removed line says
   * what it was worth.
   */
  let { changes, from }: { changes: PlanChange[]; from: string } = $props()

  const FOLDED = 6
  let open = $state(false)
  let shown = $derived(open ? changes : changes.slice(0, FOLDED))
</script>

<section class="changes">
  <h3>{t('budget.changesTitle', { month: monthLabel(from) })}</h3>
  <ul>
    {#each shown as change, i (i)}
      <li>
        {#if change.kind === 'amount'}
          <span class="name">{change.name}</span>
          <span class="what"><Money value={change.from} /> → <Money value={change.to} /></span>
        {:else if change.kind === 'added'}
          <span class="name added">
            <span class="mark" aria-hidden="true">+</span>{change.name}
            {#if change.category}<span class="category">{change.category}</span>{/if}
          </span>
          <span class="what">{t('change.added')} · <Money value={change.amount} /></span>
        {:else if change.kind === 'removed'}
          <span class="name removed">
            <span class="mark" aria-hidden="true">−</span><s>{change.name}</s>
            {#if change.category}<span class="category">{change.category}</span>{/if}
          </span>
          <span class="what">{t('change.removed')} · {t('change.was')} <Money value={change.amount} /></span>
        {:else if change.kind === 'renamed'}
          <span class="name">{change.from}</span>
          <span class="what">{t('change.renamed', { name: change.to })}</span>
        {:else if change.kind === 'moved'}
          <span class="name">{change.name}</span>
          <span class="what">{t('change.moved', { category: change.to })}</span>
        {:else if change.kind === 'retyped'}
          <span class="name">{change.name}</span>
          <span class="what">{t(`entryType.${change.from}`)} → {t(`entryType.${change.to}`)}</span>
        {:else if change.kind === 'automatic'}
          <span class="name">{change.name}</span>
          <span class="what">{change.on ? t('change.automaticOn') : t('change.automaticOff')}</span>
        {/if}
      </li>
    {/each}
  </ul>
  {#if changes.length > FOLDED}
    <button class="more" aria-expanded={open} onclick={() => (open = !open)}>
      {open ? t('change.showFewer') : t('change.showAll', { count: String(changes.length) })}
    </button>
  {/if}
</section>

<style>
  .changes {
    margin-bottom: 0.75rem;
    padding: 0.75rem 1rem;
    background: var(--surface);
    border-radius: 8px;
    box-shadow: var(--shadow-card);
  }

  h3 {
    margin: 0 0 0.4rem;
    font-size: 0.85rem;
    font-weight: 500;
    color: var(--ink-faint);
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  li {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 0.15rem 0.75rem;
    padding: 0.3rem 0;
    border-bottom: 1px solid var(--rule);
    font-size: 0.9rem;
  }

  li:last-child {
    border-bottom: none;
  }

  .name {
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .mark {
    display: inline-block;
    width: 1em;
    font-weight: 600;
  }

  .added .mark {
    color: var(--money-in);
  }

  .removed .mark {
    color: var(--alarm);
  }

  .removed s {
    text-decoration-color: var(--alarm);
  }

  .category {
    margin-left: 0.4rem;
    font-size: 0.75rem;
    color: var(--ink-faint);
  }

  .what {
    color: var(--ink-faint);
    font-variant-numeric: tabular-nums;
    text-align: right;
  }

  .more {
    margin-top: 0.4rem;
    padding: 0.3rem 0;
    border: none;
    background: none;
    color: var(--accent);
    font: inherit;
    font-size: 0.85rem;
    cursor: pointer;
  }
</style>
