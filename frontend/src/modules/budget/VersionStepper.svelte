<script lang="ts">
  import { t } from '../../lib/i18n/index.svelte'

  /**
   * Which version of the plan is on screen, and the way to an earlier or a
   * later one. Above the plan, where the plan's name would be: the current one
   * first, and each step back the plan as it stood before a change — months
   * that changed nothing are one step, not twelve.
   */
  interface Props {
    title: string
    /** The months it was the plan for, when the title is a name. */
    sub?: string
    onprevious?: () => void
    onnext?: () => void
  }

  let { title, sub, onprevious, onnext }: Props = $props()
</script>

<div class="stepper">
  <button class="step" aria-label={t('budget.previousVersion')} disabled={!onprevious} onclick={() => onprevious?.()}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  </button>
  <div class="label">
    <h2>{title}</h2>
    {#if sub}<span class="sub">{sub}</span>{/if}
  </div>
  <button class="step" aria-label={t('budget.nextVersion')} disabled={!onnext} onclick={() => onnext?.()}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  </button>
</div>

<style>
  .stepper {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    margin-bottom: 0.75rem;
    padding: 0.35rem 0.5rem;
    background: var(--surface);
    border-radius: 8px;
    box-shadow: var(--shadow-card);
  }

  .label {
    min-width: 0;
    text-align: center;
  }

  h2 {
    margin: 0;
    font-size: 1.05rem;
    font-weight: 500;
    overflow-wrap: anywhere;
  }

  .sub {
    font-size: 0.8rem;
    color: var(--ink-faint);
  }

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
</style>
