<script lang="ts">
  import { t } from '../../lib/i18n/index.svelte'
  import Money from '../../lib/util/Money.svelte'
  import { spentShare } from '../../lib/belege/belegeEngine'

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
    /**
     * Stepping to another month, from the card that names it — beside the
     * thing it changes rather than in the dial, where a month switcher was a
     * control nobody thought to look for.
     */
    onprevious?: () => void
    onnext?: () => void
    /** Show the stepping arrows — disabled where there is no month to go to. */
    stepper?: boolean
  }

  let { title, planned, spent, basis, onprevious, onnext, stepper = false }: Props = $props()

  let left = $derived(planned - spent)
  let share = $derived(spentShare(spent, planned))
</script>

<div class="summary">
  {#if stepper}
    <div class="head">
      <button class="step" aria-label={t('spending.previousMonth')} disabled={!onprevious} onclick={() => onprevious?.()}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>
      <h3>{title}</h3>
      <button class="step" aria-label={t('spending.nextMonth')} disabled={!onnext} onclick={() => onnext?.()}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>
    </div>
  {:else}
    <h3>{title}</h3>
  {/if}
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

  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    margin: -0.35rem -0.5rem 0.6rem;
  }

  .head h3 {
    margin: 0;
    text-align: center;
  }

  /* 44px: thumb targets, at the top of the card where the month is named. */
  .step {
    width: 44px;
    height: 44px;
    padding: 0;
    flex: none;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: 8px;
    background: none;
    color: var(--ink);
    cursor: pointer;
  }

  .step:hover:not(:disabled) {
    background: var(--sunken);
  }

  .step:disabled {
    opacity: 0.25;
    cursor: default;
  }

  .step svg {
    width: 20px;
    height: 20px;
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
