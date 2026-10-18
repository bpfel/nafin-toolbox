<script lang="ts">
  import { t } from '../../lib/i18n/index.svelte'
  import Money from '../../lib/util/Money.svelte'

  /**
   * A month in three figures: planned, spent, and what is left — the question
   * Review is opened to answer, in the place Budget answers its own, on the
   * same card. One bar under them, so "how far through" reads at a glance.
   */
  interface Props {
    title: string
    /** Rappen. */
    planned: number
    /** Rappen. */
    spent: number
    /** What the month is compared with, in a sentence. */
    basis?: string
  }

  let { title, planned, spent, basis }: Props = $props()

  let left = $derived(planned - spent)
  let share = $derived(planned > 0 ? Math.min(100, Math.round((spent / planned) * 100)) : 0)
</script>

<div class="summary">
  <h3>{title}</h3>
  <div class="figures">
    <div class="figure">
      <span class="label">{t('spending.planned')}</span>
      <span class="value"><Money value={planned} cents /></span>
    </div>
    <div class="figure">
      <span class="label">{t('spending.spent')}</span>
      <span class="value" class:over={spent > planned}><Money value={spent} cents /></span>
    </div>
    <div class="figure">
      <span class="label">{t('spending.left')}</span>
      <span class="value left" class:over={left < 0}><Money value={left} cents /></span>
    </div>
  </div>
  {#if planned > 0}
    <div class="bar" aria-hidden="true">
      <span class="fill" class:over={spent > planned} style:width="{share}%"></span>
    </div>
  {/if}
  {#if basis}
    <p class="basis">{basis}</p>
  {/if}
</div>

<style>
  .summary {
    padding: 1rem 1.25rem;
    background: var(--surface);
    border-radius: 8px;
    box-shadow: var(--shadow-card);
    margin-bottom: 1rem;
  }

  h3 {
    margin: 0 0 0.6rem;
    font-size: 1.05rem;
    font-weight: 500;
  }

  .figures {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 1rem;
  }

  .figure {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    min-width: 0;
  }

  .label {
    font-size: 0.75rem;
    color: var(--ink-faint);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .value {
    font-size: 1rem;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
  }

  .left {
    color: var(--money-in);
  }

  .over {
    color: var(--alarm);
  }

  .bar {
    margin-top: 0.75rem;
    height: 6px;
    border-radius: 3px;
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

  .basis {
    margin: 0.5rem 0 0;
    font-size: 0.8rem;
    color: var(--ink-faint);
  }
</style>
